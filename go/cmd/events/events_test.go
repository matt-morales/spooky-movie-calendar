package main

import (
	"bytes"
	"context"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/postgres"
	commentpg "github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/pgtest"
)

var pg *pgtest.Server

func TestMain(m *testing.M) {
	pg = pgtest.MustStart()
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

var ctx = context.Background()

// seeded returns a connection to a migrated database (app and comments)
// with a few events, ratings and reviews for the 2025 lineup.
func seeded(t *testing.T) *pgx.Conn {
	t.Helper()
	url := pg.NewDatabase(t)
	if err := postgres.Migrate(url); err != nil {
		t.Fatal(err)
	}
	if err := commentpg.Migrate(url); err != nil {
		t.Fatal(err)
	}
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(ctx) })

	now := time.Now()
	for _, e := range []struct {
		typ, visitor, country, referrer, props string
		ago                                    time.Duration
	}{
		{"page_view", "v1", "NZ", "https://letterboxd.com/", `{}`, time.Hour},
		{"page_view", "v2", "US", "", `{}`, 2 * time.Hour},
		{"page_view", "v1", "NZ", "", `{}`, 30 * 24 * time.Hour}, // outside the window
		{"day_selected", "v1", "NZ", "", `{"day": 3}`, time.Hour},
		{"day_selected", "v2", "US", "", `{"day": 3}`, time.Hour},
		{"reviews_opened", "v1", "NZ", "", `{"movieId": "2025-01"}`, time.Hour},
		{"watched_toggled", "v1", "NZ", "", `{"movieId": "2025-01", "watched": true}`, time.Hour},
		{"watched_toggled", "v2", "US", "", `{"movieId": "2025-01", "watched": false}`, time.Hour},
		{"rating_saved", "v2", "", "", `{"movieId": "2025-01", "value": 8}`, time.Hour},
	} {
		_, err := conn.Exec(ctx, `INSERT INTO events (type, source, visitor_id, country, referrer, props, occurred_at)
			VALUES ($1, 'client', $2, $3, $4, $5, $6)`, e.typ, e.visitor, e.country, e.referrer, e.props, now.Add(-e.ago))
		if err != nil {
			t.Fatal(err)
		}
	}

	for _, sql := range []string{
		`INSERT INTO ratings (movie_id, visitor_id, value) VALUES ('2025-01', 'v1', 8), ('2025-01', 'v2', 6)`,
		`INSERT INTO comments (thread_key, author_id, body) VALUES ('movie:2025-01', 'v1', 'So good')`,
		`INSERT INTO comments (thread_key, author_id, body, status) VALUES ('movie:2025-01', 'v2', 'spam', 'hidden')`,
	} {
		if _, err := conn.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	return conn
}

func runReport(t *testing.T, conn *pgx.Conn, name string) string {
	t.Helper()
	var out bytes.Buffer
	if err := run(ctx, conn, &out, name, options{days: 7, tz: "UTC", year: 2025}); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return out.String()
}

func TestTypesCountsEventsInTheWindow(t *testing.T) {
	out := runReport(t, seeded(t), "types")
	if !regexpMatch(`page_view\s+2\s+2`, out) || !regexpMatch(`day_selected\s+2\s+2`, out) {
		t.Errorf("types report:\n%s", out)
	}
}

func TestNightsAndMoviesUseTheirProps(t *testing.T) {
	conn := seeded(t)
	if out := runReport(t, conn, "nights"); !regexpMatch(`3\s+2\s+2`, out) {
		t.Errorf("nights report:\n%s", out)
	}
}

func TestMoviesCoversTheWholeLineup(t *testing.T) {
	out := runReport(t, seeded(t), "movies")
	// night, title, card opens, watched, ratings, average /10, reviews.
	// Ratings and reviews come from their own tables; hidden reviews don't count.
	if !regexpMatch(`(?m)^1\s+Christine\s+1\s+1\s+2\s+7\.0\s+1\s*$`, out) {
		t.Errorf("Christine's row:\n%s", out)
	}
	if !regexpMatch(`(?m)^2\s+The Grudge\s+0\s+0\s+0\s+0\s*$`, out) {
		t.Errorf("a night with no activity is still listed:\n%s", out)
	}
	if n := strings.Count(out, "\n"); n < 31 {
		t.Errorf("want every night of 2025, got %d lines:\n%s", n, out)
	}
}

func TestCountriesShowsEachCountrysShare(t *testing.T) {
	out := runReport(t, seeded(t), "countries")
	// country, visitors, share of visitors, page views, sessions
	if !regexpMatch(`(?m)^NZ\s+1\s+50%\s+1\s+`, out) || !regexpMatch(`(?m)^US\s+1\s+50%\s+1\s+`, out) {
		t.Errorf("countries report:\n%s", out)
	}
}

func TestFullReportHasOverviewMoviesAndCountries(t *testing.T) {
	out := runReport(t, seeded(t), "full")
	for _, want := range []string{"Events by type", "Per day", "Per movie, 2025", "Visitors by country"} {
		if !strings.Contains(out, want) {
			t.Errorf("full report is missing %q:\n%s", want, out)
		}
	}
}

func TestEveryReportRuns(t *testing.T) {
	conn := seeded(t)
	for _, name := range reportNames() {
		if out := runReport(t, conn, name); !strings.Contains(out, "──") {
			t.Errorf("%s printed no table:\n%s", name, out)
		}
	}
}

func TestUnknownReportListsTheRealOnes(t *testing.T) {
	err := run(ctx, seeded(t), &bytes.Buffer{}, "nope", options{days: 7, tz: "UTC", year: 2025})
	if err == nil || !strings.Contains(err.Error(), "full") {
		t.Errorf("err = %v", err)
	}
}

func TestReportsCannotWrite(t *testing.T) {
	conn := seeded(t)
	err := readOnly(ctx, conn, "UTC", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "DELETE FROM events")
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Errorf("delete in a report transaction: err = %v", err)
	}
}

func regexpMatch(pattern, s string) bool { return regexp.MustCompile(pattern).MatchString(s) }
