package comment

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Store is the driven port for persistence.
type Store interface {
	// Insert stores a new comment and returns it with its ID assigned.
	Insert(ctx context.Context, c Comment) (Comment, error)
	// Get returns ErrNotFound when the comment doesn't exist.
	Get(ctx context.Context, id ID) (Comment, error)
	// ListThread returns up to limitRoots top-level comments, newest first and
	// older than beforeRootID (0 = start from the newest), together with all
	// of their descendants. Order in the returned slice is unspecified.
	ListThread(ctx context.Context, threadKey string, beforeRootID ID, limitRoots int) ([]Comment, error)
	CountByAuthorSince(ctx context.Context, authorID string, since time.Time) (int, error)
	// SetStatus returns ErrNotFound when the comment doesn't exist.
	SetStatus(ctx context.Context, id ID, status Status) error
}

// Verifier is the driven port that checks a poster is human (e.g. Turnstile).
// It returns ErrNotHuman for a failed check.
type Verifier interface {
	Verify(ctx context.Context, token, remoteIP string) error
}

// VerifierFunc adapts a plain function to Verifier, e.g. to wrap a CAPTCHA
// client and translate its rejection error into ErrNotHuman.
type VerifierFunc func(ctx context.Context, token, remoteIP string) error

func (f VerifierFunc) Verify(ctx context.Context, token, remoteIP string) error {
	return f(ctx, token, remoteIP)
}

type Config struct {
	MaxDepth   int           // replies may nest this many levels (root is depth 0)
	RateLimit  int           // max comments per author per RateWindow
	RateWindow time.Duration //
	PageSize   int           // top-level comments per page
}

var DefaultConfig = Config{MaxDepth: 5, RateLimit: 5, RateWindow: time.Minute, PageSize: 20}

func (c Config) withDefaults() Config {
	if c.MaxDepth <= 0 {
		c.MaxDepth = DefaultConfig.MaxDepth
	}
	if c.RateLimit <= 0 {
		c.RateLimit = DefaultConfig.RateLimit
	}
	if c.RateWindow <= 0 {
		c.RateWindow = DefaultConfig.RateWindow
	}
	if c.PageSize <= 0 {
		c.PageSize = DefaultConfig.PageSize
	}
	return c
}

type Option func(*Service)

func WithConfig(c Config) Option            { return func(s *Service) { s.cfg = c.withDefaults() } }
func WithClock(now func() time.Time) Option { return func(s *Service) { s.now = now } }

// WithOnPosted registers a hook called after a comment is stored, e.g. to
// record an analytics event. It must not block for long.
func WithOnPosted(fn func(context.Context, Comment)) Option {
	return func(s *Service) { s.onPosted = fn }
}

// Service holds the comment use cases. It is the driving port.
type Service struct {
	store    Store
	verifier Verifier
	cfg      Config
	now      func() time.Time
	onPosted func(context.Context, Comment)
}

func NewService(store Store, verifier Verifier, opts ...Option) *Service {
	s := &Service{store: store, verifier: verifier, cfg: DefaultConfig, now: time.Now}
	for _, o := range opts {
		o(s)
	}
	return s
}

type PostInput struct {
	ThreadKey         string
	ParentID          ID
	AuthorID          string
	AuthorName        string
	Body              string
	VerificationToken string
	RemoteIP          string
}

func (s *Service) Post(ctx context.Context, in PostInput) (Comment, error) {
	if err := ValidateThreadKey(in.ThreadKey); err != nil {
		return Comment{}, err
	}
	if in.AuthorID == "" {
		return Comment{}, errors.New("comment: author id is required")
	}
	body, err := NormalizeBody(in.Body)
	if err != nil {
		return Comment{}, err
	}
	name, err := NormalizeAuthorName(in.AuthorName)
	if err != nil {
		return Comment{}, err
	}

	if err := s.verifier.Verify(ctx, in.VerificationToken, in.RemoteIP); err != nil {
		return Comment{}, err
	}

	now := s.now()
	n, err := s.store.CountByAuthorSince(ctx, in.AuthorID, now.Add(-s.cfg.RateWindow))
	if err != nil {
		return Comment{}, fmt.Errorf("count recent comments: %w", err)
	}
	if n >= s.cfg.RateLimit {
		return Comment{}, ErrRateLimited
	}

	depth := 0
	if in.ParentID != 0 {
		parent, err := s.store.Get(ctx, in.ParentID)
		if errors.Is(err, ErrNotFound) || (err == nil && parent.ThreadKey != in.ThreadKey) {
			return Comment{}, ErrParentNotFound
		}
		if err != nil {
			return Comment{}, fmt.Errorf("load parent: %w", err)
		}
		depth = parent.Depth + 1
		if depth >= s.cfg.MaxDepth {
			return Comment{}, ErrTooDeep
		}
	}

	c, err := s.store.Insert(ctx, Comment{
		ThreadKey:  in.ThreadKey,
		ParentID:   in.ParentID,
		Depth:      depth,
		AuthorID:   in.AuthorID,
		AuthorName: name,
		Body:       body,
		Status:     StatusVisible,
		CreatedAt:  now,
	})
	if err != nil {
		return Comment{}, fmt.Errorf("insert comment: %w", err)
	}
	if s.onPosted != nil {
		s.onPosted(ctx, c)
	}
	return c, nil
}

type Page struct {
	Comments []*Node
	// NextBefore is passed back to Thread to get the next page (0 = no more).
	NextBefore ID
}

func (s *Service) Thread(ctx context.Context, threadKey string, before ID) (Page, error) {
	if err := ValidateThreadKey(threadKey); err != nil {
		return Page{}, err
	}
	flat, err := s.store.ListThread(ctx, threadKey, before, s.cfg.PageSize)
	if err != nil {
		return Page{}, fmt.Errorf("list thread: %w", err)
	}

	var page Page
	roots := 0
	for _, c := range flat {
		if c.ParentID == 0 {
			roots++
			if page.NextBefore == 0 || c.ID < page.NextBefore {
				page.NextBefore = c.ID
			}
		}
	}
	if roots < s.cfg.PageSize {
		page.NextBefore = 0
	}
	page.Comments = BuildTree(flat)
	return page, nil
}

// Moderate sets a comment's status (e.g. hide spam). For moderators only.
func (s *Service) Moderate(ctx context.Context, id ID, status Status) error {
	if !status.Valid() {
		return ErrInvalidStatus
	}
	return s.store.SetStatus(ctx, id, status)
}

// DeleteOwn lets an author delete their own comment. Someone else's comment
// is reported as not found so IDs can't be probed.
func (s *Service) DeleteOwn(ctx context.Context, id ID, authorID string) error {
	c, err := s.store.Get(ctx, id)
	if err != nil {
		return err
	}
	if c.AuthorID != authorID {
		return ErrNotFound
	}
	return s.store.SetStatus(ctx, id, StatusDeleted)
}
