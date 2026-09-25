package domain_test

import (
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

var now = time.Date(2025, 10, 13, 21, 0, 0, 0, time.UTC)

var meta = domain.RequestMeta{
	VisitorID: "v1",
	UserAgent: "Mozilla/5.0",
	Country:   "US",
}

func TestNewClientEventEnrichesFromRequest(t *testing.T) {
	e, err := domain.NewClientEvent(domain.EventInput{
		Type:       "page_view",
		SessionID:  "s-123",
		Path:       "/#movie-13",
		Referrer:   "https://letterboxd.com/",
		OccurredAt: now.Add(-2 * time.Second),
		Props:      map[string]any{"day": 13},
	}, meta, now)
	if err != nil {
		t.Fatal(err)
	}

	if e.Source != domain.SourceClient || e.VisitorID != "v1" || e.Country != "US" || e.UserAgent != "Mozilla/5.0" {
		t.Errorf("not enriched: %+v", e)
	}
	if !e.OccurredAt.Equal(now.Add(-2*time.Second)) || !e.ReceivedAt.Equal(now) {
		t.Errorf("times wrong: %+v", e)
	}
	if e.Props["day"] != 13 {
		t.Errorf("props lost: %+v", e.Props)
	}
}

func TestNewClientEventValidatesType(t *testing.T) {
	for _, bad := range []string{"", "PageView", "page view", "1st", strings.Repeat("a", 65)} {
		_, err := domain.NewClientEvent(domain.EventInput{Type: bad}, meta, now)
		if !errors.Is(err, domain.ErrInvalidEventType) {
			t.Errorf("type %q: got %v, want ErrInvalidEventType", bad, err)
		}
	}
}

func TestNewClientEventClampsUntrustedClock(t *testing.T) {
	for _, skew := range []time.Duration{-48 * time.Hour, 48 * time.Hour} {
		e, err := domain.NewClientEvent(domain.EventInput{Type: "x", OccurredAt: now.Add(skew)}, meta, now)
		if err != nil {
			t.Fatal(err)
		}
		if !e.OccurredAt.Equal(now) {
			t.Errorf("skew %v: OccurredAt = %v, want server time", skew, e.OccurredAt)
		}
	}
	e, _ := domain.NewClientEvent(domain.EventInput{Type: "x"}, meta, now)
	if !e.OccurredAt.Equal(now) {
		t.Errorf("missing time should default to server time")
	}
}

func TestNewClientEventLimitsSizes(t *testing.T) {
	long := "/" + strings.Repeat("a", 5000)
	e, err := domain.NewClientEvent(domain.EventInput{
		Type: "x", Path: long, Referrer: long, SessionID: "not valid!",
	}, domain.RequestMeta{VisitorID: "v", UserAgent: strings.Repeat("u", 2000)}, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(e.Path) != domain.MaxURLLen || len(e.Referrer) != domain.MaxURLLen || len(e.UserAgent) != domain.MaxUserAgentLen {
		t.Errorf("not truncated: path %d, ref %d, ua %d", len(e.Path), len(e.Referrer), len(e.UserAgent))
	}
	if e.SessionID != "" {
		t.Errorf("invalid session id kept: %q", e.SessionID)
	}

	_, err = domain.NewClientEvent(domain.EventInput{
		Type: "x", Props: map[string]any{"blob": strings.Repeat("x", domain.MaxPropsBytes)},
	}, meta, now)
	if !errors.Is(err, domain.ErrPropsTooLarge) {
		t.Errorf("got %v, want ErrPropsTooLarge", err)
	}
}

func TestNewServerEvent(t *testing.T) {
	e := domain.NewServerEvent("rating_saved", "v1", map[string]any{"value": 8}, now)
	if e.Source != domain.SourceServer || e.Type != "rating_saved" || !e.OccurredAt.Equal(now) || e.Props["value"] != 8 {
		t.Errorf("unexpected: %+v", e)
	}
}

func TestTruncationKeepsValidUTF8(t *testing.T) {
	e, err := domain.NewClientEvent(domain.EventInput{Type: "x", Path: "/" + strings.Repeat("é", 3000)}, meta, now)
	if err != nil {
		t.Fatal(err)
	}
	if !utf8.ValidString(e.Path) || len(e.Path) > domain.MaxURLLen {
		t.Errorf("path invalid or too long: %d bytes, valid=%v", len(e.Path), utf8.ValidString(e.Path))
	}
}
