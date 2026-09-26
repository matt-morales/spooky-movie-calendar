package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/httpapi"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/app"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/memstore"
)

// Stubs for the driving ports; the use cases themselves are tested in app.

type stubCatalog struct {
	gotYear    int
	gotVisitor domain.VisitorID
}

func (s *stubCatalog) Movies(_ context.Context, year int, v domain.VisitorID) ([]app.MovieWithRating, error) {
	s.gotYear, s.gotVisitor = year, v
	mine := domain.RatingValue(8)
	return []app.MovieWithRating{{
		Movie: domain.Movie{
			ID: "2025-01", Year: 2025, Day: 1, Date: time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC),
			Title: "Christine", Directors: []string{"John Carpenter"}, PosterPath: "posters/christine.jpg", HostRating: 7,
		},
		Rating: domain.RatingSummary{Average: 7, Count: 2, Mine: &mine},
	}}, nil
}

func (s *stubCatalog) Lineup(_ context.Context, year int) (domain.Lineup, error) {
	return domain.Lineup{Year: year, LetterboxdListURL: "https://letterboxd.com/someone/list/x/"}, nil
}

type stubRater struct{ err error }

func (s stubRater) Rate(_ context.Context, _ domain.VisitorID, id string, v int) (domain.RatingSummary, error) {
	if s.err != nil {
		return domain.RatingSummary{}, s.err
	}
	val := domain.RatingValue(v)
	return domain.RatingSummary{Average: float64(v), Count: 1, Mine: &val}, nil
}

type stubTracker struct {
	meta   domain.RequestMeta
	inputs []domain.EventInput
}

func (s *stubTracker) Track(_ context.Context, meta domain.RequestMeta, in []domain.EventInput) (app.TrackResult, error) {
	if len(in) > domain.MaxEventsPerBatch {
		return app.TrackResult{}, domain.ErrTooManyEvents
	}
	s.meta, s.inputs = meta, in
	return app.TrackResult{Accepted: len(in)}, nil
}

type deps struct {
	catalog *stubCatalog
	tracker *stubTracker
	rater   stubRater
}

func newServer(t *testing.T, d *deps) http.Handler {
	t.Helper()
	if d.catalog == nil {
		d.catalog = &stubCatalog{}
	}
	if d.tracker == nil {
		d.tracker = &stubTracker{}
	}
	return httpapi.NewServer(httpapi.Config{
		Catalog:       d.catalog,
		Ratings:       d.rater,
		Analytics:     d.tracker,
		Comments:      comment.NewService(memstore.New(), comment.VerifierFunc(func(context.Context, string, string) error { return nil })),
		VisitorSecret: []byte("test-secret"),
		ImagesBaseURL: "https://images.example.com",
		CurrentYear:   func() int { return 2025 },
	})
}

func request(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("CF-IPCountry", "NZ")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	rec := request(newServer(t, &deps{}), "GET", "/api/healthz", "")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestListMovies(t *testing.T) {
	d := &deps{}
	rec := request(newServer(t, d), "GET", "/api/movies?year=2025", "")
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var body struct {
		Movies []map[string]any `json:"movies"`
		Lineup map[string]any   `json:"lineup"`
	}
	json.NewDecoder(rec.Body).Decode(&body)
	if len(body.Movies) != 1 {
		t.Fatalf("body = %+v", body)
	}
	if body.Lineup["year"] != 2025.0 || body.Lineup["letterboxdListUrl"] != "https://letterboxd.com/someone/list/x/" {
		t.Errorf("lineup = %+v", body.Lineup)
	}
	m := body.Movies[0]
	if m["id"] != "2025-01" || m["date"] != "2025-10-01" || m["posterUrl"] != "https://images.example.com/posters/christine.jpg" {
		t.Errorf("movie = %+v", m)
	}
	rating := m["rating"].(map[string]any)
	if rating["average"] != 7.0 || rating["count"] != 2.0 || rating["mine"] != 8.0 {
		t.Errorf("rating = %+v", rating)
	}
	if d.catalog.gotYear != 2025 || d.catalog.gotVisitor == "" {
		t.Errorf("catalog called with year %d visitor %q", d.catalog.gotYear, d.catalog.gotVisitor)
	}
}

func TestListMoviesDefaultsToCurrentYearAndRejectsJunk(t *testing.T) {
	d := &deps{}
	h := newServer(t, d)
	if rec := request(h, "GET", "/api/movies", ""); rec.Code != 200 || d.catalog.gotYear != 2025 {
		t.Errorf("default year: status %d year %d", rec.Code, d.catalog.gotYear)
	}
	if rec := request(h, "GET", "/api/movies?year=abc", ""); rec.Code != 400 {
		t.Errorf("junk year: status %d", rec.Code)
	}
}

func TestRateMovie(t *testing.T) {
	rec := request(newServer(t, &deps{}), "PUT", "/api/movies/2025-01/rating", `{"value":6}`)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got map[string]any
	json.NewDecoder(rec.Body).Decode(&got)
	if got["mine"] != 6.0 || got["count"] != 1.0 {
		t.Errorf("body = %+v", got)
	}
}

func TestRateMovieErrors(t *testing.T) {
	cases := []struct {
		err  error
		body string
		want int
	}{
		{nil, `not json`, 400},
		{domain.ErrInvalidRating, `{"value":3}`, 422},
		{domain.ErrInvalidMovieID, `{"value":6}`, 404},
		{domain.ErrMovieNotFound, `{"value":6}`, 404},
	}
	for _, tc := range cases {
		rec := request(newServer(t, &deps{rater: stubRater{err: tc.err}}), "PUT", "/api/movies/x/rating", tc.body)
		if rec.Code != tc.want {
			t.Errorf("%v: status %d, want %d", tc.err, rec.Code, tc.want)
		}
	}
}

func TestTrackEvents(t *testing.T) {
	d := &deps{}
	rec := request(newServer(t, d), "POST", "/api/events",
		`{"events":[{"type":"page_view","sessionId":"s1","path":"/","referrer":"https://x.test","occurredAt":"2025-10-01T20:00:00Z","props":{"day":1}}]}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(d.tracker.inputs) != 1 {
		t.Fatalf("inputs = %+v", d.tracker.inputs)
	}
	in := d.tracker.inputs[0]
	if in.Type != "page_view" || in.SessionID != "s1" || in.Props["day"] != 1.0 || in.OccurredAt.IsZero() {
		t.Errorf("input = %+v", in)
	}
	if d.tracker.meta.UserAgent != "test-agent" || d.tracker.meta.Country != "NZ" || d.tracker.meta.VisitorID == "" {
		t.Errorf("meta = %+v", d.tracker.meta)
	}
	// The first request a visitor makes (this analytics call) issues their cookie.
	if len(rec.Result().Cookies()) != 1 {
		t.Errorf("expected visitor cookie on first request")
	}
}

func TestTrackRejectsHugeBatch(t *testing.T) {
	events := strings.Repeat(`{"type":"x"},`, domain.MaxEventsPerBatch) + `{"type":"x"}`
	rec := request(newServer(t, &deps{}), "POST", "/api/events", `{"events":[`+events+`]}`)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status %d", rec.Code)
	}
}

func TestCommentsAreMounted(t *testing.T) {
	rec := request(newServer(t, &deps{}), "GET", "/api/threads/movie:2025-01/comments", "")
	if rec.Code != 200 {
		t.Errorf("status %d: %s", rec.Code, rec.Body)
	}
}

func TestTrackPrefersCountryFromEdgeProxy(t *testing.T) {
	d := &deps{}
	req := httptest.NewRequest("POST", "/api/events", strings.NewReader(`{"events":[{"type":"page_view"}]}`))
	req.Header.Set("X-Client-Country", "IE")
	newServer(t, d).ServeHTTP(httptest.NewRecorder(), req)
	if d.tracker.meta.Country != "IE" {
		t.Errorf("country = %q, want IE", d.tracker.meta.Country)
	}
}
