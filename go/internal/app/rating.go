package app

import (
	"context"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

type Ratings struct {
	movies    MovieRepository
	ratings   RatingRepository
	analytics *Analytics
	now       func() time.Time
}

func NewRatings(movies MovieRepository, ratings RatingRepository, analytics *Analytics, now func() time.Time) *Ratings {
	return &Ratings{movies: movies, ratings: ratings, analytics: analytics, now: now}
}

// Rate saves (or changes) a visitor's rating and returns the movie's new summary.
func (r *Ratings) Rate(ctx context.Context, visitor domain.VisitorID, rawMovieID string, rawValue int) (domain.RatingSummary, error) {
	movieID, err := domain.ParseMovieID(rawMovieID)
	if err != nil {
		return domain.RatingSummary{}, err
	}
	value, err := domain.ParseRating(rawValue)
	if err != nil {
		return domain.RatingSummary{}, err
	}
	exists, err := r.movies.MovieExists(ctx, movieID)
	if err != nil {
		return domain.RatingSummary{}, err
	}
	if !exists {
		return domain.RatingSummary{}, domain.ErrMovieNotFound
	}

	if err := r.ratings.SaveRating(ctx, movieID, visitor, value, r.now()); err != nil {
		return domain.RatingSummary{}, err
	}
	r.analytics.Record(ctx, "rating_saved", visitor, map[string]any{"movieId": string(movieID), "value": int(value)})
	return r.ratings.RatingSummary(ctx, movieID, visitor)
}
