package app

import (
	"context"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

type MovieWithRating struct {
	domain.Movie
	Rating domain.RatingSummary
}

// Catalog lists a year's lineup with each movie's ratings, in one call, so
// the page needs a single request instead of one per movie.
type Catalog struct {
	movies  MovieRepository
	ratings RatingRepository
}

func NewCatalog(movies MovieRepository, ratings RatingRepository) *Catalog {
	return &Catalog{movies: movies, ratings: ratings}
}

func (c *Catalog) Movies(ctx context.Context, year int, visitor domain.VisitorID) ([]MovieWithRating, error) {
	movies, err := c.movies.ListMovies(ctx, year)
	if err != nil {
		return nil, err
	}
	summaries, err := c.ratings.RatingSummaries(ctx, year, visitor)
	if err != nil {
		return nil, err
	}
	out := make([]MovieWithRating, len(movies))
	for i, m := range movies {
		out[i] = MovieWithRating{Movie: m, Rating: summaries[m.ID]}
	}
	return out, nil
}
