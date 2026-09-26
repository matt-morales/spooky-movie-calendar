package pgtest_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/pgtest"
)

var pg *pgtest.Server

func TestMain(m *testing.M) {
	pg = pgtest.MustStart()
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

func TestNewDatabaseIsIsolated(t *testing.T) {
	ctx := context.Background()

	a, err := pgx.Connect(ctx, pg.NewDatabase(t))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close(ctx)
	if _, err := a.Exec(ctx, "CREATE TABLE only_in_a (id int)"); err != nil {
		t.Fatal(err)
	}

	b, err := pgx.Connect(ctx, pg.NewDatabase(t))
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close(ctx)
	var exists bool
	err = b.QueryRow(ctx, "SELECT to_regclass('only_in_a') IS NOT NULL").Scan(&exists)
	if err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("table from database A is visible in database B")
	}
}
