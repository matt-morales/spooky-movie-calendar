package dbmigrate_test

import (
	"context"
	"os"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/dbmigrate"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/pgtest"
)

var pg *pgtest.Server

func TestMain(m *testing.M) {
	pg = pgtest.MustStart()
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

func tableExists(t *testing.T, url, name string) bool {
	t.Helper()
	ctx := context.Background()
	c, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close(ctx)
	var ok bool
	if err := c.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", name).Scan(&ok); err != nil {
		t.Fatal(err)
	}
	return ok
}

var appMigrations = fstest.MapFS{
	"000001_create.up.sql":   {Data: []byte("CREATE TABLE a (id int);")},
	"000001_create.down.sql": {Data: []byte("DROP TABLE a;")},
	"000002_more.up.sql":     {Data: []byte("CREATE TABLE b (id int);")},
	"000002_more.down.sql":   {Data: []byte("DROP TABLE b;")},
}

func TestUpIsIdempotent(t *testing.T) {
	url := pg.NewDatabase(t)

	for range 2 {
		if err := dbmigrate.Up(url, appMigrations, "schema_migrations"); err != nil {
			t.Fatal(err)
		}
	}
	if !tableExists(t, url, "a") || !tableExists(t, url, "b") {
		t.Fatal("migrations not applied")
	}
}

func TestModulesTrackVersionsSeparately(t *testing.T) {
	url := pg.NewDatabase(t)
	module := fstest.MapFS{
		"000001_init.up.sql":   {Data: []byte("CREATE TABLE c (id int);")},
		"000001_init.down.sql": {Data: []byte("DROP TABLE c;")},
	}

	if err := dbmigrate.Up(url, appMigrations, "schema_migrations"); err != nil {
		t.Fatal(err)
	}
	// The module's version 1 must still run even though the app is at version 2.
	if err := dbmigrate.Up(url, module, "comment_schema_migrations"); err != nil {
		t.Fatal(err)
	}
	if !tableExists(t, url, "c") {
		t.Fatal("module migration skipped")
	}
}

func TestConcurrentUpIsSafe(t *testing.T) {
	url := pg.NewDatabase(t)
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for range 4 {
		wg.Go(func() { errs <- dbmigrate.Up(url, appMigrations, "schema_migrations") })
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent Up: %v", err)
		}
	}
}
