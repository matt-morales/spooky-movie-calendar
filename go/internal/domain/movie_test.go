package domain_test

import (
	"errors"
	"testing"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

func TestNewMovieID(t *testing.T) {
	if got := domain.NewMovieID(2025, 7); got != "2025-07" {
		t.Errorf("got %q", got)
	}
}

func TestParseMovieID(t *testing.T) {
	for _, ok := range []string{"2025-01", "2026-31"} {
		if _, err := domain.ParseMovieID(ok); err != nil {
			t.Errorf("ParseMovieID(%q) = %v", ok, err)
		}
	}
	for _, bad := range []string{"", "7", "2025-7", "2025-32", "2025-00", "abcd-01", "2025-01; DROP"} {
		if _, err := domain.ParseMovieID(bad); !errors.Is(err, domain.ErrInvalidMovieID) {
			t.Errorf("ParseMovieID(%q) = %v, want ErrInvalidMovieID", bad, err)
		}
	}
}

func TestParseRating(t *testing.T) {
	for _, v := range []int{2, 4, 6, 8, 10} {
		if got, err := domain.ParseRating(v); err != nil || int(got) != v {
			t.Errorf("ParseRating(%d) = %v, %v", v, got, err)
		}
	}
	for _, v := range []int{0, 1, 3, 11, -2, 12} {
		if _, err := domain.ParseRating(v); !errors.Is(err, domain.ErrInvalidRating) {
			t.Errorf("ParseRating(%d) = %v, want ErrInvalidRating", v, err)
		}
	}
}

func TestRatingDrops(t *testing.T) {
	// Stored on a 2–10 scale, shown as 1–5 blood drops.
	s := domain.RatingSummary{Average: 7, Count: 3}
	if s.AverageDrops() != 3.5 {
		t.Errorf("AverageDrops = %v, want 3.5", s.AverageDrops())
	}
}
