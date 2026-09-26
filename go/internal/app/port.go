// Package app holds the use cases. It depends only on the domain and on the
// driven ports declared here; adapters implement the ports and cmd/api wires
// everything together.
package app

import (
	"context"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

type MovieRepository interface {
	ListMovies(ctx context.Context, year int) ([]domain.Movie, error)
	MovieExists(ctx context.Context, id domain.MovieID) (bool, error)
	// Lineup returns domain.ErrLineupNotFound if the year has no lineup row.
	Lineup(ctx context.Context, year int) (domain.Lineup, error)
}

type RatingRepository interface {
	// SaveRating inserts or replaces the visitor's rating for a movie.
	SaveRating(ctx context.Context, movie domain.MovieID, visitor domain.VisitorID, value domain.RatingValue, at time.Time) error
	RatingSummary(ctx context.Context, movie domain.MovieID, visitor domain.VisitorID) (domain.RatingSummary, error)
	// RatingSummaries returns summaries for every rated movie in a year.
	RatingSummaries(ctx context.Context, year int, visitor domain.VisitorID) (map[domain.MovieID]domain.RatingSummary, error)
}

type EventRepository interface {
	AppendEvents(ctx context.Context, events []domain.Event) error
}
