// Package httpapi is the driving HTTP adapter: it turns requests into use
// case calls and results into JSON. It depends on the use cases through the
// small interfaces below (driving ports), not on their implementations.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/app"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	commenthttp "github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/httpapi"
)

type Catalog interface {
	Movies(ctx context.Context, year int, visitor domain.VisitorID) ([]app.MovieWithRating, error)
	Lineup(ctx context.Context, year int) (domain.Lineup, error)
}

type Rater interface {
	Rate(ctx context.Context, visitor domain.VisitorID, movieID string, value int) (domain.RatingSummary, error)
}

type Tracker interface {
	Track(ctx context.Context, meta domain.RequestMeta, inputs []domain.EventInput) (app.TrackResult, error)
}

type Config struct {
	Catalog       Catalog
	Ratings       Rater
	Analytics     Tracker
	Comments      *comment.Service
	VisitorSecret []byte
	SecureCookies bool   // true in production (HTTPS only)
	ImagesBaseURL string // e.g. https://images.31nightsofhorror.com
	CurrentYear   func() int
}

type server struct{ Config }

func NewServer(cfg Config) http.Handler {
	s := &server{cfg}
	if s.CurrentYear == nil {
		s.CurrentYear = func() int { return time.Now().Year() }
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/movies", s.listMovies)
	mux.HandleFunc("PUT /api/movies/{id}/rating", s.rateMovie)
	mux.HandleFunc("POST /api/events", s.trackEvents)

	commenthttp.New(cfg.Comments, func(r *http.Request) (string, bool) {
		v, ok := VisitorFrom(r.Context())
		return string(v), ok
	}).Register(mux, "/api")

	return logRequests(VisitorMiddleware(cfg.VisitorSecret, cfg.SecureCookies)(mux))
}

type ratingJSON struct {
	Average float64 `json:"average"` // 1–10 scale
	Count   int     `json:"count"`
	Mine    *int    `json:"mine"`
}

func toRatingJSON(s domain.RatingSummary) ratingJSON {
	out := ratingJSON{Average: s.Average, Count: s.Count}
	if s.Mine != nil {
		v := int(*s.Mine)
		out.Mine = &v
	}
	return out
}

type movieJSON struct {
	ID            string     `json:"id"`
	Year          int        `json:"year"`
	Day           int        `json:"day"`
	Date          string     `json:"date"`
	Title         string     `json:"title"`
	Directors     []string   `json:"directors"`
	Description   string     `json:"description"`
	PosterURL     string     `json:"posterUrl"`
	ReleaseYear   int        `json:"releaseYear,omitempty"`
	LetterboxdURL string     `json:"letterboxdUrl,omitempty"`
	HostRating    int        `json:"hostRating,omitempty"`
	Rating        ratingJSON `json:"rating"`
}

type lineupJSON struct {
	Year              int    `json:"year"`
	LetterboxdListURL string `json:"letterboxdListUrl,omitempty"`
}

func (s *server) listMovies(w http.ResponseWriter, r *http.Request) {
	year := s.CurrentYear()
	if q := r.URL.Query().Get("year"); q != "" {
		y, err := strconv.Atoi(q)
		if err != nil || y < 2000 || y > 3000 {
			writeError(w, http.StatusBadRequest, "bad_request", "year must be a four-digit year")
			return
		}
		year = y
	}
	visitor, _ := VisitorFrom(r.Context())
	movies, err := s.Catalog.Movies(r.Context(), year, visitor)
	if err != nil {
		internalError(w, r, err)
		return
	}
	lineup, err := s.Catalog.Lineup(r.Context(), year)
	if err != nil {
		internalError(w, r, err)
		return
	}

	out := make([]movieJSON, len(movies))
	for i, m := range movies {
		out[i] = movieJSON{
			ID: string(m.ID), Year: m.Year, Day: m.Day, Date: m.Date.Format(time.DateOnly),
			Title: m.Title, Directors: m.Directors, Description: m.Description,
			PosterURL:   s.imageURL(m.PosterPath),
			ReleaseYear: m.ReleaseYear, LetterboxdURL: m.LetterboxdURL, HostRating: m.HostRating,
			Rating: toRatingJSON(m.Rating),
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"movies": out,
		"lineup": lineupJSON{Year: lineup.Year, LetterboxdListURL: lineup.LetterboxdListURL},
	})
}

func (s *server) imageURL(path string) string {
	if path == "" {
		return ""
	}
	return strings.TrimRight(s.ImagesBaseURL, "/") + "/" + path
}

func (s *server) rateMovie(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Value int `json:"value"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "body must be JSON like {\"value\": 8}")
		return
	}
	visitor, _ := VisitorFrom(r.Context())
	summary, err := s.Ratings.Rate(r.Context(), visitor, r.PathValue("id"), in.Value)
	switch {
	case errors.Is(err, domain.ErrInvalidRating):
		writeError(w, http.StatusUnprocessableEntity, "invalid_rating", err.Error())
	case errors.Is(err, domain.ErrInvalidMovieID), errors.Is(err, domain.ErrMovieNotFound):
		writeError(w, http.StatusNotFound, "not_found", "movie not found")
	case err != nil:
		internalError(w, r, err)
	default:
		writeJSON(w, http.StatusOK, toRatingJSON(summary))
	}
}

func (s *server) trackEvents(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Events []struct {
			Type       string         `json:"type"`
			SessionID  string         `json:"sessionId"`
			Path       string         `json:"path"`
			Referrer   string         `json:"referrer"`
			OccurredAt time.Time      `json:"occurredAt"`
			Props      map[string]any `json:"props"`
		} `json:"events"`
	}
	// Content-Type isn't checked: navigator.sendBeacon may send text/plain.
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10)).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "body must be JSON like {\"events\": [...]}")
		return
	}

	inputs := make([]domain.EventInput, len(in.Events))
	for i, e := range in.Events {
		inputs[i] = domain.EventInput{
			Type: e.Type, SessionID: e.SessionID, Path: e.Path, Referrer: e.Referrer,
			OccurredAt: e.OccurredAt, Props: e.Props,
		}
	}
	visitor, _ := VisitorFrom(r.Context())
	meta := domain.RequestMeta{
		VisitorID: visitor,
		UserAgent: r.UserAgent(),
		Country:   firstHeader(r, "X-Client-Country", "CF-IPCountry"), // set by Cloudflare
	}

	res, err := s.Analytics.Track(r.Context(), meta, inputs)
	switch {
	case errors.Is(err, domain.ErrTooManyEvents):
		writeError(w, http.StatusRequestEntityTooLarge, "too_many_events", err.Error())
	case err != nil:
		internalError(w, r, err)
	default:
		writeJSON(w, http.StatusAccepted, map[string]int{"accepted": res.Accepted, "rejected": res.Rejected})
	}
}

// firstHeader returns the first non-empty header. The Cloudflare Pages proxy
// copies CF-* values into X-Client-* headers when forwarding to Cloud Run.
func firstHeader(r *http.Request, names ...string) string {
	for _, n := range names {
		if v := r.Header.Get(n); v != "" {
			return v
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": msg}})
}

func internalError(w http.ResponseWriter, r *http.Request, err error) {
	slog.ErrorContext(r.Context(), "request failed", "err", err, "method", r.Method, "path", r.URL.Path)
	writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// logRequests writes one structured log line per request (Cloud Run picks up
// JSON logs from stdout).
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		slog.InfoContext(r.Context(), "request",
			"method", r.Method, "path", r.URL.Path, "status", rec.status, "duration_ms", time.Since(start).Milliseconds())
	})
}
