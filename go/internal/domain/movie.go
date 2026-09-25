// Package domain holds the app's core types and rules. It has no
// dependencies on storage, HTTP or any other adapter.
package domain

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"time"
)

var (
	ErrInvalidMovieID = errors.New("invalid movie id")
	ErrMovieNotFound  = errors.New("movie not found")
	ErrInvalidRating  = errors.New("rating must be 2, 4, 6, 8 or 10")
)

// MovieID is "<year>-<day>", e.g. "2025-07". It is stable across years, so
// the 2026 lineup never inherits 2025's ratings.
type MovieID string

func NewMovieID(year, day int) MovieID {
	return MovieID(fmt.Sprintf("%04d-%02d", year, day))
}

var movieIDRE = regexp.MustCompile(`^\d{4}-(\d{2})$`)

func ParseMovieID(s string) (MovieID, error) {
	m := movieIDRE.FindStringSubmatch(s)
	if m == nil {
		return "", ErrInvalidMovieID
	}
	if day, _ := strconv.Atoi(m[1]); day < 1 || day > 31 {
		return "", ErrInvalidMovieID
	}
	return MovieID(s), nil
}

type Movie struct {
	ID            MovieID
	Year          int
	Day           int
	Date          time.Time // the night it's scheduled, midnight UTC
	Title         string
	Directors     []string
	Description   string
	PosterPath    string // relative to the images base URL, e.g. "posters/2025/christine.jpg"
	ReleaseYear   int    // 0 if unknown
	LetterboxdURL string
	HostRating    int // the curator's own rating out of 10, 0 if none
}

// RatingValue is stored on a 2–10 scale and shown as 1–5 blood drops.
type RatingValue int

func ParseRating(v int) (RatingValue, error) {
	if v < 2 || v > 10 || v%2 != 0 {
		return 0, ErrInvalidRating
	}
	return RatingValue(v), nil
}

type RatingSummary struct {
	Average float64 // on the 2–10 scale; 0 when Count is 0
	Count   int
	Mine    *RatingValue // the viewer's own rating, if any
}

func (s RatingSummary) AverageDrops() float64 { return s.Average / 2 }

// VisitorID identifies an anonymous browser (from a signed cookie).
type VisitorID string
