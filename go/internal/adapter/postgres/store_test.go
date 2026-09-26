package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/adapter/postgres"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/pgtest"
)

var pg *pgtest.Server

func TestMain(m *testing.M) {
	pg = pgtest.MustStart()
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

var (
	ctx = context.Background()
	at  = time.Date(2025, 10, 5, 21, 0, 0, 0, time.UTC)
)

func newStore(t *testing.T) (*postgres.Store, *pgxpool.Pool) {
	t.Helper()
	url := pg.NewDatabase(t)
	if err := postgres.Migrate(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return postgres.New(pool), pool
}

func TestMigrationsSeedThe2025Lineup(t *testing.T) {
	s, _ := newStore(t)

	movies, err := s.ListMovies(ctx, 2025)
	if err != nil {
		t.Fatal(err)
	}
	if len(movies) != 31 {
		t.Fatalf("got %d movies, want 31", len(movies))
	}
	first := movies[0]
	if first.ID != "2025-01" || first.Day != 1 || first.Title != "Christine" ||
		len(first.Directors) != 1 || first.Directors[0] != "John Carpenter" ||
		first.PosterPath != "posters/christine.jpg" || first.HostRating != 7 ||
		!first.Date.Equal(time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("first movie = %+v", first)
	}
	if movies[4].Directors[1] != "Parkpoom Wongpoom" {
		t.Errorf("co-directors not split: %v", movies[4].Directors)
	}
	if movies[10].Directors[0] != "Zach Cregger" {
		t.Errorf("Weapons director not fixed: %v", movies[10].Directors)
	}

	none, _ := s.ListMovies(ctx, 1999)
	if len(none) != 0 {
		t.Errorf("unexpected movies for 1999")
	}
}

func TestEvery2025MovieLinksToLetterboxd(t *testing.T) {
	s, _ := newStore(t)

	movies, err := s.ListMovies(ctx, 2025)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range movies {
		if !strings.HasPrefix(m.LetterboxdURL, "https://letterboxd.com/film/") || m.ReleaseYear == 0 {
			t.Errorf("%s %q: letterboxd %q, release year %d", m.ID, m.Title, m.LetterboxdURL, m.ReleaseYear)
		}
	}
	if m := movies[0]; m.LetterboxdURL != "https://letterboxd.com/film/christine-1983/" || m.ReleaseYear != 1983 {
		t.Errorf("Christine = %q, %d", m.LetterboxdURL, m.ReleaseYear)
	}
	// Directors that didn't match the film the poster (and link) shows.
	for day, want := range map[int]string{26: "Alexandre Aja", 28: "Carlos Aured", 29: "Jung Bum-shik"} {
		if got := movies[day-1].Directors; len(got) != 1 || got[0] != want {
			t.Errorf("day %d directors = %v, want [%s]", day, got, want)
		}
	}
}

func TestMigrationsSeedThe2026Lineup(t *testing.T) {
	s, _ := newStore(t)

	movies, err := s.ListMovies(ctx, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if len(movies) != 26 {
		t.Fatalf("got %d movies, want 26", len(movies))
	}
	first := movies[0]
	if first.ID != "2026-01" || first.Title != "Backrooms" || first.ReleaseYear != 2026 ||
		len(first.Directors) != 1 || first.Directors[0] != "Kane Parsons" ||
		first.PosterPath != "posters/backrooms-2026.jpg" || first.Description == "" ||
		first.LetterboxdURL != "https://letterboxd.com/film/backrooms-2026/" ||
		!first.Date.Equal(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("first movie = %+v", first)
	}
	if m := movies[4]; m.Title != "Late Night with the Devil" || m.HostRating != 7 || len(m.Directors) != 2 {
		t.Errorf("day 5 = %+v", m)
	}
	if m := movies[6]; m.Title != "Trick 'r Treat" {
		t.Errorf("apostrophe mangled: %q", m.Title)
	}
	if m := movies[25]; m.Day != 26 || m.Title != "When Evil Lurks" {
		t.Errorf("last movie = %+v", m)
	}
}

func TestLineupLinksToItsLetterboxdList(t *testing.T) {
	s, _ := newStore(t)

	for year, want := range map[int]string{
		2025: "https://letterboxd.com/snowkempm/list/31-nights-of-halloween-whore-movies/",
		2026: "https://letterboxd.com/mattmo/list/31-nights-of-horror-2026/",
	} {
		l, err := s.Lineup(ctx, year)
		if err != nil {
			t.Fatal(err)
		}
		if l.Year != year || l.LetterboxdListURL != want {
			t.Errorf("lineup %d = %+v", year, l)
		}
	}

	if _, err := s.Lineup(ctx, 1999); !errors.Is(err, domain.ErrLineupNotFound) {
		t.Errorf("1999: err = %v, want ErrLineupNotFound", err)
	}
}

func TestMigrationsRollBackCleanly(t *testing.T) {
	url := pg.NewDatabase(t)
	m, err := postgres.NewMigrator(url)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	if err := m.Up(); err != nil {
		t.Fatal(err)
	}
	if err := m.Down(); err != nil {
		t.Fatalf("down: %v", err)
	}
	if err := m.Up(); err != nil {
		t.Fatalf("up again: %v", err)
	}
}

func TestMovieExists(t *testing.T) {
	s, _ := newStore(t)
	if ok, err := s.MovieExists(ctx, "2025-31"); err != nil || !ok {
		t.Errorf("2025-31: %v, %v", ok, err)
	}
	if ok, _ := s.MovieExists(ctx, "2025-32"); ok {
		t.Errorf("2025-32 should not exist")
	}
}

func TestRatings(t *testing.T) {
	s, _ := newStore(t)

	must(t, s.SaveRating(ctx, "2025-01", "v1", 4, at))
	must(t, s.SaveRating(ctx, "2025-01", "v1", 8, at.Add(time.Hour))) // changed mind
	must(t, s.SaveRating(ctx, "2025-01", "v2", 10, at))
	must(t, s.SaveRating(ctx, "2025-02", "v2", 2, at))

	got, err := s.RatingSummary(ctx, "2025-01", "v1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Count != 2 || got.Average != 9 || got.Mine == nil || *got.Mine != 8 {
		t.Errorf("summary = %+v, want avg 9 of 2, mine 8", got)
	}

	unrated, _ := s.RatingSummary(ctx, "2025-03", "v1")
	if unrated.Count != 0 || unrated.Average != 0 || unrated.Mine != nil {
		t.Errorf("unrated = %+v", unrated)
	}

	all, err := s.RatingSummaries(ctx, 2025, "v1")
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 || all["2025-02"].Count != 1 || all["2025-02"].Mine != nil || *all["2025-01"].Mine != 8 {
		t.Errorf("summaries = %+v", all)
	}
}

func TestAppendEvents(t *testing.T) {
	s, pool := newStore(t)

	err := s.AppendEvents(ctx, []domain.Event{
		{Type: "page_view", Source: domain.SourceClient, VisitorID: "v1", Path: "/", Country: "US", OccurredAt: at, ReceivedAt: at},
		{Type: "rating_saved", Source: domain.SourceServer, VisitorID: "v1", Props: map[string]any{"value": 8}, OccurredAt: at, ReceivedAt: at},
	})
	if err != nil {
		t.Fatal(err)
	}

	var n int
	var props []byte
	must(t, pool.QueryRow(ctx, `SELECT count(*) FROM events`).Scan(&n))
	must(t, pool.QueryRow(ctx, `SELECT props FROM events WHERE type = 'rating_saved'`).Scan(&props))
	var p map[string]any
	json.Unmarshal(props, &p)
	if n != 2 || p["value"] != float64(8) {
		t.Errorf("count = %d, props = %s", n, props)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
