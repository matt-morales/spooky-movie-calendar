package domain

import (
	"encoding/json"
	"errors"
	"regexp"
	"time"
	"unicode/utf8"
)

// Events are the analytics log: everything that happens on the site, from
// page views sent by the browser to ratings and comments saved by the server.

const (
	MaxEventsPerBatch = 25
	MaxURLLen         = 2048
	MaxUserAgentLen   = 512
	MaxPropsBytes     = 4096
	// Client clocks are trusted only within this window of the server's.
	MaxClockSkew = 24 * time.Hour
)

var (
	ErrInvalidEventType = errors.New("event type must be snake_case, up to 64 characters")
	ErrPropsTooLarge    = errors.New("event props are too large")
	ErrTooManyEvents    = errors.New("too many events in one batch")
)

type EventSource string

const (
	SourceClient EventSource = "client"
	SourceServer EventSource = "server"
)

type Event struct {
	Type       string
	Source     EventSource
	VisitorID  VisitorID
	SessionID  string
	Path       string
	Referrer   string
	UserAgent  string
	Country    string
	Props      map[string]any
	OccurredAt time.Time
	ReceivedAt time.Time
}

// EventInput is what a browser sends; it is untrusted.
type EventInput struct {
	Type       string
	SessionID  string
	Path       string
	Referrer   string
	OccurredAt time.Time
	Props      map[string]any
}

// RequestMeta is what the server knows about the request that carried events.
type RequestMeta struct {
	VisitorID VisitorID
	UserAgent string
	Country   string
}

var (
	eventTypeRE = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
	sessionRE   = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

func NewClientEvent(in EventInput, meta RequestMeta, now time.Time) (Event, error) {
	if !eventTypeRE.MatchString(in.Type) {
		return Event{}, ErrInvalidEventType
	}
	if in.Props != nil {
		b, err := json.Marshal(in.Props)
		if err != nil || len(b) > MaxPropsBytes {
			return Event{}, ErrPropsTooLarge
		}
	}

	occurred := in.OccurredAt
	if occurred.IsZero() || occurred.Sub(now).Abs() > MaxClockSkew {
		occurred = now
	}
	session := in.SessionID
	if !sessionRE.MatchString(session) {
		session = ""
	}

	return Event{
		Type:       in.Type,
		Source:     SourceClient,
		VisitorID:  meta.VisitorID,
		SessionID:  session,
		Path:       truncate(in.Path, MaxURLLen),
		Referrer:   truncate(in.Referrer, MaxURLLen),
		UserAgent:  truncate(meta.UserAgent, MaxUserAgentLen),
		Country:    truncate(meta.Country, 2),
		Props:      in.Props,
		OccurredAt: occurred,
		ReceivedAt: now,
	}, nil
}

// NewServerEvent records something the server itself did (e.g. saved a rating).
func NewServerEvent(eventType string, visitor VisitorID, props map[string]any, now time.Time) Event {
	return Event{
		Type:       eventType,
		Source:     SourceServer,
		VisitorID:  visitor,
		Props:      props,
		OccurredAt: now,
		ReceivedAt: now,
	}
}

// truncate cuts s to at most n bytes without splitting a UTF-8 character.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}
