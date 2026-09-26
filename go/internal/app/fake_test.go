package app_test

import (
	"context"
	"errors"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

// In-memory fakes of the driven ports. The real adapters are tested against
// Postgres in adapter/postgres.

type fakeMovies struct {
	movies  []domain.Movie
	lineups []domain.Lineup
}

func (f *fakeMovies) Lineup(_ context.Context, year int) (domain.Lineup, error) {
	for _, l := range f.lineups {
		if l.Year == year {
			return l, nil
		}
	}
	return domain.Lineup{}, domain.ErrLineupNotFound
}

func (f *fakeMovies) ListMovies(_ context.Context, year int) ([]domain.Movie, error) {
	var out []domain.Movie
	for _, m := range f.movies {
		if m.Year == year {
			out = append(out, m)
		}
	}
	return out, nil
}

func (f *fakeMovies) MovieExists(_ context.Context, id domain.MovieID) (bool, error) {
	for _, m := range f.movies {
		if m.ID == id {
			return true, nil
		}
	}
	return false, nil
}

type savedRating struct {
	movie   domain.MovieID
	visitor domain.VisitorID
	value   domain.RatingValue
	at      time.Time
}

type fakeRatings struct {
	saved []savedRating
}

func (f *fakeRatings) SaveRating(_ context.Context, m domain.MovieID, v domain.VisitorID, val domain.RatingValue, at time.Time) error {
	for i, s := range f.saved {
		if s.movie == m && s.visitor == v {
			f.saved[i].value, f.saved[i].at = val, at
			return nil
		}
	}
	f.saved = append(f.saved, savedRating{m, v, val, at})
	return nil
}

func (f *fakeRatings) RatingSummary(_ context.Context, m domain.MovieID, v domain.VisitorID) (domain.RatingSummary, error) {
	var s domain.RatingSummary
	sum := 0
	for _, r := range f.saved {
		if r.movie != m {
			continue
		}
		s.Count++
		sum += int(r.value)
		if r.visitor == v {
			mine := r.value
			s.Mine = &mine
		}
	}
	if s.Count > 0 {
		s.Average = float64(sum) / float64(s.Count)
	}
	return s, nil
}

func (f *fakeRatings) RatingSummaries(ctx context.Context, _ int, v domain.VisitorID) (map[domain.MovieID]domain.RatingSummary, error) {
	out := map[domain.MovieID]domain.RatingSummary{}
	for _, r := range f.saved {
		out[r.movie], _ = f.RatingSummary(ctx, r.movie, v)
	}
	return out, nil
}

type fakeEvents struct {
	events []domain.Event
	err    error
}

func (f *fakeEvents) AppendEvents(_ context.Context, events []domain.Event) error {
	if f.err != nil {
		return f.err
	}
	f.events = append(f.events, events...)
	return nil
}

var errDown = errors.New("database down")
