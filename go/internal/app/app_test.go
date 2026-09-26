package app_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/app"
	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

var (
	ctx     = context.Background()
	now     = time.Date(2025, 10, 7, 22, 0, 0, 0, time.UTC)
	clock   = func() time.Time { return now }
	lineup  = []domain.Movie{{ID: "2025-01", Year: 2025, Day: 1, Title: "Christine"}, {ID: "2025-02", Year: 2025, Day: 2, Title: "The Grudge"}}
	visitor = domain.VisitorID("v1")
)

func TestCatalogMergesRatingsIntoMovies(t *testing.T) {
	ratings := &fakeRatings{}
	ratings.SaveRating(ctx, "2025-01", "v1", 8, now)
	ratings.SaveRating(ctx, "2025-01", "v2", 4, now)
	catalog := app.NewCatalog(&fakeMovies{movies: lineup}, ratings)

	got, err := catalog.Movies(ctx, 2025, visitor)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d movies", len(got))
	}
	r := got[0].Rating
	if got[0].Title != "Christine" || r.Count != 2 || r.Average != 6 || r.Mine == nil || *r.Mine != 8 {
		t.Errorf("movie 1 = %+v", got[0])
	}
	if got[1].Rating.Count != 0 || got[1].Rating.Mine != nil {
		t.Errorf("unrated movie should have an empty summary: %+v", got[1].Rating)
	}
}

func TestCatalogLineup(t *testing.T) {
	list := domain.Lineup{Year: 2025, LetterboxdListURL: "https://letterboxd.com/someone/list/x/"}
	catalog := app.NewCatalog(&fakeMovies{movies: lineup, lineups: []domain.Lineup{list}}, &fakeRatings{})

	if got, err := catalog.Lineup(ctx, 2025); err != nil || got != list {
		t.Errorf("2025 = %+v, %v", got, err)
	}
	// A year without a lineup row still has movies to show, just no list link.
	if got, err := catalog.Lineup(ctx, 2030); err != nil || got != (domain.Lineup{Year: 2030}) {
		t.Errorf("2030 = %+v, %v", got, err)
	}
}

func TestRateValidatesInput(t *testing.T) {
	ratings := app.NewRatings(&fakeMovies{movies: lineup}, &fakeRatings{}, app.NewAnalytics(&fakeEvents{}, clock), clock)

	cases := []struct {
		movie string
		value int
		want  error
	}{
		{"nope", 8, domain.ErrInvalidMovieID},
		{"2025-01", 7, domain.ErrInvalidRating},
		{"2025-30", 8, domain.ErrMovieNotFound},
	}
	for _, tc := range cases {
		if _, err := ratings.Rate(ctx, visitor, tc.movie, tc.value); !errors.Is(err, tc.want) {
			t.Errorf("Rate(%q, %d) = %v, want %v", tc.movie, tc.value, err, tc.want)
		}
	}
}

func TestRateSavesAndRecordsEvent(t *testing.T) {
	store := &fakeRatings{}
	events := &fakeEvents{}
	ratings := app.NewRatings(&fakeMovies{movies: lineup}, store, app.NewAnalytics(events, clock), clock)

	if _, err := ratings.Rate(ctx, visitor, "2025-02", 6); err != nil {
		t.Fatal(err)
	}
	summary, err := ratings.Rate(ctx, visitor, "2025-02", 10) // change of heart
	if err != nil {
		t.Fatal(err)
	}

	if summary.Count != 1 || summary.Average != 10 || *summary.Mine != 10 {
		t.Errorf("summary = %+v, want one rating of 10", summary)
	}
	if len(events.events) != 2 {
		t.Fatalf("recorded %d events, want 2", len(events.events))
	}
	e := events.events[1]
	if e.Type != "rating_saved" || e.Source != domain.SourceServer || e.VisitorID != visitor ||
		e.Props["movieId"] != "2025-02" || e.Props["value"] != 10 {
		t.Errorf("event = %+v", e)
	}
}

func TestTrackStoresValidEventsAndCountsRejects(t *testing.T) {
	events := &fakeEvents{}
	analytics := app.NewAnalytics(events, clock)
	meta := domain.RequestMeta{VisitorID: visitor, Country: "CA"}

	res, err := analytics.Track(ctx, meta, []domain.EventInput{
		{Type: "page_view", Path: "/"},
		{Type: "Not Valid"},
		{Type: "day_selected", Props: map[string]any{"day": 3}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Accepted != 2 || res.Rejected != 1 {
		t.Errorf("result = %+v, want 2 accepted, 1 rejected", res)
	}
	if len(events.events) != 2 || events.events[0].Country != "CA" || events.events[1].Type != "day_selected" {
		t.Errorf("stored = %+v", events.events)
	}
}

func TestTrackRejectsOversizedBatch(t *testing.T) {
	analytics := app.NewAnalytics(&fakeEvents{}, clock)
	batch := make([]domain.EventInput, domain.MaxEventsPerBatch+1)
	if _, err := analytics.Track(ctx, domain.RequestMeta{}, batch); !errors.Is(err, domain.ErrTooManyEvents) {
		t.Errorf("got %v, want ErrTooManyEvents", err)
	}
}

func TestTrackReportsStorageFailure(t *testing.T) {
	analytics := app.NewAnalytics(&fakeEvents{err: errDown}, clock)
	if _, err := analytics.Track(ctx, domain.RequestMeta{}, []domain.EventInput{{Type: "page_view"}}); !errors.Is(err, errDown) {
		t.Errorf("got %v, want storage error", err)
	}
}

func TestRecordNeverFailsTheCaller(t *testing.T) {
	// A broken analytics store must not break rating a movie.
	ratings := app.NewRatings(&fakeMovies{movies: lineup}, &fakeRatings{}, app.NewAnalytics(&fakeEvents{err: errDown}, clock), clock)
	if _, err := ratings.Rate(ctx, visitor, "2025-01", 8); err != nil {
		t.Fatalf("Rate failed because analytics failed: %v", err)
	}
}
