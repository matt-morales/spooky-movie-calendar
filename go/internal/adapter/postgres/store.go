// Package postgres implements the app's driven ports on Postgres (Neon in
// production). SQL lives in queries.sql and migrations/; sqlc generates the
// typed query code in internal/db (`go tool sqlc generate`).
package postgres

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/postgres/internal/db"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/dbmigrate"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

const MigrationsTable = "schema_migrations"

func migrations() fs.FS {
	sub, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		panic(err)
	}
	return sub
}

// Migrate brings the app schema (and seeded lineups) up to date.
func Migrate(databaseURL string) error {
	return dbmigrate.Up(databaseURL, migrations(), MigrationsTable)
}

// NewMigrator exposes golang-migrate for admin commands (down, version, force).
func NewMigrator(databaseURL string) (*migrate.Migrate, error) {
	return dbmigrate.New(databaseURL, migrations(), MigrationsTable)
}

type Store struct {
	q *db.Queries
}

func New(pool *pgxpool.Pool) *Store { return &Store{q: db.New(pool)} }

func (s *Store) ListMovies(ctx context.Context, year int) ([]domain.Movie, error) {
	rows, err := s.q.ListMoviesByYear(ctx, int32(year))
	if err != nil {
		return nil, err
	}
	out := make([]domain.Movie, len(rows))
	for i, r := range rows {
		out[i] = domain.Movie{
			ID:            domain.MovieID(r.ID),
			Year:          int(r.Year),
			Day:           int(r.Day),
			Date:          r.Date,
			Title:         r.Title,
			Directors:     r.Directors,
			Description:   r.Description,
			PosterPath:    r.PosterPath,
			LetterboxdURL: r.LetterboxdUrl,
		}
		if r.ReleaseYear != nil {
			out[i].ReleaseYear = int(*r.ReleaseYear)
		}
		if r.HostRating != nil {
			out[i].HostRating = int(*r.HostRating)
		}
	}
	return out, nil
}

func (s *Store) Lineup(ctx context.Context, year int) (domain.Lineup, error) {
	r, err := s.q.GetLineup(ctx, int32(year))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Lineup{}, domain.ErrLineupNotFound
	}
	if err != nil {
		return domain.Lineup{}, err
	}
	return domain.Lineup{Year: int(r.Year), LetterboxdListURL: r.LetterboxdListUrl}, nil
}

func (s *Store) MovieExists(ctx context.Context, id domain.MovieID) (bool, error) {
	return s.q.MovieExists(ctx, string(id))
}

func (s *Store) SaveRating(ctx context.Context, movie domain.MovieID, visitor domain.VisitorID, value domain.RatingValue, at time.Time) error {
	return s.q.SaveRating(ctx, db.SaveRatingParams{
		MovieID: string(movie), VisitorID: string(visitor), Value: int16(value), At: at,
	})
}

func (s *Store) RatingSummary(ctx context.Context, movie domain.MovieID, visitor domain.VisitorID) (domain.RatingSummary, error) {
	r, err := s.q.RatingSummary(ctx, db.RatingSummaryParams{MovieID: string(movie), VisitorID: string(visitor)})
	if err != nil {
		return domain.RatingSummary{}, err
	}
	return summary(r.Average, r.Count, r.Mine), nil
}

func (s *Store) RatingSummaries(ctx context.Context, year int, visitor domain.VisitorID) (map[domain.MovieID]domain.RatingSummary, error) {
	rows, err := s.q.RatingSummariesByYear(ctx, db.RatingSummariesByYearParams{Year: int32(year), VisitorID: string(visitor)})
	if err != nil {
		return nil, err
	}
	out := make(map[domain.MovieID]domain.RatingSummary, len(rows))
	for _, r := range rows {
		out[domain.MovieID(r.MovieID)] = summary(r.Average, r.Count, r.Mine)
	}
	return out, nil
}

func summary(avg float64, count int64, mine int16) domain.RatingSummary {
	s := domain.RatingSummary{Average: avg, Count: int(count)}
	if mine != 0 {
		v := domain.RatingValue(mine)
		s.Mine = &v
	}
	return s
}

func (s *Store) AppendEvents(ctx context.Context, events []domain.Event) error {
	params := make([]db.InsertEventsParams, len(events))
	for i, e := range events {
		props := json.RawMessage("{}")
		if len(e.Props) > 0 {
			b, err := json.Marshal(e.Props)
			if err != nil {
				return err
			}
			props = b
		}
		params[i] = db.InsertEventsParams{
			Type: e.Type, Source: string(e.Source), VisitorID: string(e.VisitorID), SessionID: e.SessionID,
			Path: e.Path, Referrer: e.Referrer, UserAgent: e.UserAgent, Country: e.Country,
			Props: props, OccurredAt: e.OccurredAt, ReceivedAt: e.ReceivedAt,
		}
	}
	_, err := s.q.InsertEvents(ctx, params)
	return err
}
