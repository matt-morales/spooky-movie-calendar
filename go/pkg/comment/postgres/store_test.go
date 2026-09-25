package postgres_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/storetest"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/pgtest"
)

var pg *pgtest.Server

func TestMain(m *testing.M) {
	pg = pgtest.MustStart()
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

func TestContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) comment.Store {
		ctx := context.Background()
		url := pg.NewDatabase(t)
		pool, err := pgxpool.New(ctx, url)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(pool.Close)
		if err := postgres.Migrate(url); err != nil {
			t.Fatal(err)
		}
		return postgres.New(pool)
	})
}
