package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/internal/domain"
)

// Analytics stores site events: those the browser reports (Track) and those
// the server itself produces (Record).
type Analytics struct {
	events EventRepository
	now    func() time.Time
}

func NewAnalytics(events EventRepository, now func() time.Time) *Analytics {
	return &Analytics{events: events, now: now}
}

type TrackResult struct {
	Accepted int
	Rejected int
}

// Track validates and stores a batch of browser events. Invalid events are
// dropped and counted rather than failing the whole batch.
func (a *Analytics) Track(ctx context.Context, meta domain.RequestMeta, inputs []domain.EventInput) (TrackResult, error) {
	if len(inputs) > domain.MaxEventsPerBatch {
		return TrackResult{}, domain.ErrTooManyEvents
	}
	now := a.now()
	var res TrackResult
	events := make([]domain.Event, 0, len(inputs))
	for _, in := range inputs {
		e, err := domain.NewClientEvent(in, meta, now)
		if err != nil {
			res.Rejected++
			continue
		}
		events = append(events, e)
	}
	if len(events) > 0 {
		if err := a.events.AppendEvents(ctx, events); err != nil {
			return TrackResult{}, err
		}
	}
	res.Accepted = len(events)
	return res, nil
}

// Record stores a server-side event. Analytics must never break the feature
// that produced the event, so failures are logged, not returned.
func (a *Analytics) Record(ctx context.Context, eventType string, visitor domain.VisitorID, props map[string]any) {
	e := domain.NewServerEvent(eventType, visitor, props, a.now())
	if err := a.events.AppendEvents(ctx, []domain.Event{e}); err != nil {
		slog.WarnContext(ctx, "record analytics event", "type", eventType, "err", err)
	}
}
