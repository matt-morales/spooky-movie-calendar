// Package postgres is the Postgres adapter for comment.Store.
//
// SQL lives in queries.sql and the migrations directory; sqlc generates the
// typed query code in internal/db (`go tool sqlc generate`).
package postgres

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/postgres/internal/db"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/dbmigrate"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// MigrationsTable is where golang-migrate tracks this module's schema version,
// separate from the host app's own migrations.
const MigrationsTable = "comment_schema_migrations"

// Migrations are the golang-migrate files that create the comments table.
func Migrations() fs.FS {
	sub, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		panic(err)
	}
	return sub
}

// Migrate brings the comments schema up to date.
func Migrate(databaseURL string) error {
	return dbmigrate.Up(databaseURL, Migrations(), MigrationsTable)
}

type Store struct {
	q *db.Queries
}

func New(pool *pgxpool.Pool) *Store { return &Store{q: db.New(pool)} }

func (s *Store) Insert(ctx context.Context, c comment.Comment) (comment.Comment, error) {
	row, err := s.q.InsertComment(ctx, db.InsertCommentParams{
		ThreadKey:  c.ThreadKey,
		ParentID:   parentToDB(c.ParentID),
		Depth:      int16(c.Depth),
		AuthorID:   c.AuthorID,
		AuthorName: c.AuthorName,
		Body:       c.Body,
		Status:     string(c.Status),
		CreatedAt:  c.CreatedAt,
	})
	return fromDB(row), err
}

func (s *Store) Get(ctx context.Context, id comment.ID) (comment.Comment, error) {
	row, err := s.q.GetComment(ctx, int64(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return comment.Comment{}, comment.ErrNotFound
	}
	return fromDB(row), err
}

func (s *Store) ListThread(ctx context.Context, key string, before comment.ID, limit int) ([]comment.Comment, error) {
	rows, err := s.q.ListThread(ctx, db.ListThreadParams{ThreadKey: key, BeforeID: int64(before), PageSize: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]comment.Comment, len(rows))
	for i, r := range rows {
		out[i] = fromDB(db.Comment(r))
	}
	return out, nil
}

func (s *Store) CountByAuthorSince(ctx context.Context, authorID string, since time.Time) (int, error) {
	n, err := s.q.CountCommentsByAuthorSince(ctx, db.CountCommentsByAuthorSinceParams{AuthorID: authorID, CreatedAt: since})
	return int(n), err
}

func (s *Store) SetStatus(ctx context.Context, id comment.ID, status comment.Status) error {
	n, err := s.q.SetCommentStatus(ctx, db.SetCommentStatusParams{ID: int64(id), Status: string(status)})
	if err != nil {
		return err
	}
	if n == 0 {
		return comment.ErrNotFound
	}
	return nil
}

func fromDB(r db.Comment) comment.Comment {
	c := comment.Comment{
		ID:         comment.ID(r.ID),
		ThreadKey:  r.ThreadKey,
		Depth:      int(r.Depth),
		AuthorID:   r.AuthorID,
		AuthorName: r.AuthorName,
		Body:       r.Body,
		Status:     comment.Status(r.Status),
		CreatedAt:  r.CreatedAt,
	}
	if r.ParentID != nil {
		c.ParentID = comment.ID(*r.ParentID)
	}
	return c
}

func parentToDB(id comment.ID) *int64 {
	if id == 0 {
		return nil
	}
	v := int64(id)
	return &v
}
