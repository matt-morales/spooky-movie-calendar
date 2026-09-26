// Package dbmigrate runs golang-migrate migrations embedded in a Go module.
//
// Each module (the app, the reusable comment package, ...) keeps its own
// migrations table, so they can each number from 000001 without clashing.
// golang-migrate's Postgres driver takes an advisory lock, so several app
// instances may call Up at startup at the same time.
package dbmigrate

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"

	"github.com/golang-migrate/migrate/v4"
	migratepgx "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
)

// New returns a migrator for callers that need more than Up (e.g. Down or
// Version in an admin command). Close it when done.
func New(databaseURL string, migrations fs.FS, table string) (*migrate.Migrate, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	driver, err := migratepgx.WithInstance(db, &migratepgx.Config{MigrationsTable: table})
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate driver: %w", err)
	}
	src, err := iofs.New(migrations, ".")
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate source: %w", err)
	}
	return migrate.NewWithInstance("iofs", src, "pgx5", driver)
}

// Up applies all pending migrations.
func Up(databaseURL string, migrations fs.FS, table string) error {
	m, err := New(databaseURL, migrations, table)
	if err != nil {
		return err
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate %s: %w", table, err)
	}
	return nil
}
