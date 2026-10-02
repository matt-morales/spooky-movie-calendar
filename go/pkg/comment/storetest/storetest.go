// Package storetest is the contract every comment.Store adapter must pass.
// Adapters call Run from their own tests with a factory for an empty store.
package storetest

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
)

func Run(t *testing.T, newStore func(t *testing.T) comment.Store) {
	t.Run("InsertAndGet", func(t *testing.T) { insertAndGet(t, newStore(t)) })
	t.Run("GetMissing", func(t *testing.T) { getMissing(t, newStore(t)) })
	t.Run("ListThreadPagesRootsWithDescendants", func(t *testing.T) { listThread(t, newStore(t)) })
	t.Run("CountByAuthorSince", func(t *testing.T) { countByAuthor(t, newStore(t)) })
	t.Run("SetStatus", func(t *testing.T) { setStatus(t, newStore(t)) })
	t.Run("Reactions", func(t *testing.T) { reactions(t, newStore(t)) })
	t.Run("CountVisible", func(t *testing.T) { countVisible(t, newStore(t)) })
}

var base = time.Date(2025, 10, 1, 20, 0, 0, 0, time.UTC)

func insert(t *testing.T, s comment.Store, c comment.Comment) comment.Comment {
	t.Helper()
	if c.ThreadKey == "" {
		c.ThreadKey = "movie:2025-01"
	}
	if c.AuthorID == "" {
		c.AuthorID = "v1"
	}
	if c.Body == "" {
		c.Body = "boo"
	}
	if c.Status == "" {
		c.Status = comment.StatusVisible
	}
	if c.CreatedAt.IsZero() {
		c.CreatedAt = base
	}
	got, err := s.Insert(context.Background(), c)
	if err != nil {
		t.Fatalf("Insert: %v", err)
	}
	return got
}

func insertAndGet(t *testing.T, s comment.Store) {
	a := insert(t, s, comment.Comment{AuthorName: "Sidney", Body: "What's your favorite scary movie?"})
	b := insert(t, s, comment.Comment{ParentID: a.ID, Depth: 1})

	if a.ID == 0 || b.ID <= a.ID {
		t.Fatalf("IDs should be assigned and increasing: %d, %d", a.ID, b.ID)
	}

	got, err := s.Get(context.Background(), b.ID)
	if err != nil {
		t.Fatal(err)
	}
	want := b
	if got.ID != want.ID || got.ParentID != a.ID || got.Depth != 1 || got.ThreadKey != want.ThreadKey ||
		got.AuthorID != want.AuthorID || got.Body != want.Body || got.Status != comment.StatusVisible ||
		!got.CreatedAt.Equal(want.CreatedAt) {
		t.Errorf("round trip mismatch:\n got  %+v\n want %+v", got, want)
	}

	got, _ = s.Get(context.Background(), a.ID)
	if got.AuthorName != "Sidney" || got.ParentID != 0 {
		t.Errorf("root round trip mismatch: %+v", got)
	}
}

func getMissing(t *testing.T, s comment.Store) {
	if _, err := s.Get(context.Background(), 12345); !errors.Is(err, comment.ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func listThread(t *testing.T, s comment.Store) {
	ctx := context.Background()
	r1 := insert(t, s, comment.Comment{})
	r1a := insert(t, s, comment.Comment{ParentID: r1.ID, Depth: 1})
	r1b := insert(t, s, comment.Comment{ParentID: r1a.ID, Depth: 2})
	r2 := insert(t, s, comment.Comment{})
	r3 := insert(t, s, comment.Comment{})
	insert(t, s, comment.Comment{ThreadKey: "movie:2025-02"}) // other thread

	// Newest two roots, no replies among them.
	got, err := s.ListThread(ctx, "movie:2025-01", 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	assertIDs(t, got, r3.ID, r2.ID)

	// Next page: the oldest root plus its whole subtree.
	got, err = s.ListThread(ctx, "movie:2025-01", r2.ID, 2)
	if err != nil {
		t.Fatal(err)
	}
	assertIDs(t, got, r1.ID, r1a.ID, r1b.ID)
}

func countByAuthor(t *testing.T, s comment.Store) {
	insert(t, s, comment.Comment{AuthorID: "a", CreatedAt: base})
	insert(t, s, comment.Comment{AuthorID: "a", CreatedAt: base.Add(time.Minute)})
	insert(t, s, comment.Comment{AuthorID: "b", CreatedAt: base.Add(time.Minute)})

	n, err := s.CountByAuthorSince(context.Background(), "a", base.Add(30*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("count = %d, want 1", n)
	}
}

func setStatus(t *testing.T, s comment.Store) {
	ctx := context.Background()
	c := insert(t, s, comment.Comment{})
	if err := s.SetStatus(ctx, c.ID, comment.StatusHidden); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(ctx, c.ID)
	if got.Status != comment.StatusHidden {
		t.Errorf("status = %s, want hidden", got.Status)
	}
	if err := s.SetStatus(ctx, 999999, comment.StatusHidden); !errors.Is(err, comment.ErrNotFound) {
		t.Errorf("missing: got %v, want ErrNotFound", err)
	}
}

func reactions(t *testing.T, s comment.Store) {
	ctx := context.Background()
	a := insert(t, s, comment.Comment{})
	b := insert(t, s, comment.Comment{})
	add := func(id comment.ID, author, emoji string, at time.Time) {
		t.Helper()
		if err := s.AddReaction(ctx, comment.ReactionRow{CommentID: id, AuthorID: author, Emoji: emoji, CreatedAt: at}); err != nil {
			t.Fatal(err)
		}
	}
	add(a.ID, "v1", "😱", base)
	add(a.ID, "v2", "😱", base.Add(time.Minute))
	add(a.ID, "v1", "💀", base.Add(2*time.Minute))
	add(a.ID, "v1", "😱", base.Add(3*time.Minute)) // again: no duplicate
	add(b.ID, "v3", "🎃", base)

	got, err := s.ListReactions(ctx, []comment.ID{a.ID})
	if err != nil {
		t.Fatal(err)
	}
	var seq []string
	for _, r := range got {
		seq = append(seq, r.AuthorID+r.Emoji)
	}
	if want := []string{"v1😱", "v2😱", "v1💀"}; !slices.Equal(seq, want) {
		t.Errorf("ListReactions = %v, want %v (oldest first, no duplicates, only comment a)", seq, want)
	}

	if err := s.RemoveReaction(ctx, a.ID, "v1", "😱"); err != nil {
		t.Fatal(err)
	}
	if err := s.RemoveReaction(ctx, a.ID, "v1", "😱"); err != nil { // already gone: fine
		t.Fatalf("removing a missing reaction: %v", err)
	}
	got, _ = s.ListReactions(ctx, []comment.ID{a.ID, b.ID})
	if len(got) != 3 {
		t.Errorf("after remove: %d reactions, want 3: %+v", len(got), got)
	}
}

func countVisible(t *testing.T, s comment.Store) {
	ctx := context.Background()
	insert(t, s, comment.Comment{ThreadKey: "movie:2025-01"})
	insert(t, s, comment.Comment{ThreadKey: "movie:2025-01"})
	hidden := insert(t, s, comment.Comment{ThreadKey: "movie:2025-01"})
	insert(t, s, comment.Comment{ThreadKey: "movie:2025-02"})
	insert(t, s, comment.Comment{ThreadKey: "movie:2025-09"}) // not asked for
	if err := s.SetStatus(ctx, hidden.ID, comment.StatusHidden); err != nil {
		t.Fatal(err)
	}

	got, err := s.CountVisible(ctx, []string{"movie:2025-01", "movie:2025-02", "movie:2025-03"})
	if err != nil {
		t.Fatal(err)
	}
	if got["movie:2025-01"] != 2 || got["movie:2025-02"] != 1 || got["movie:2025-03"] != 0 || len(got) > 3 {
		t.Errorf("CountVisible = %v", got)
	}
}

// assertIDs checks the set of returned IDs; order within a page is not part
// of the contract (the service builds the tree).
func assertIDs(t *testing.T, got []comment.Comment, want ...comment.ID) {
	t.Helper()
	seen := map[comment.ID]bool{}
	for _, c := range got {
		seen[c.ID] = true
	}
	if len(got) != len(want) {
		t.Fatalf("got %d comments %v, want %v", len(got), idsOf(got), want)
	}
	for _, id := range want {
		if !seen[id] {
			t.Fatalf("got %v, want %v", idsOf(got), want)
		}
	}
}

func idsOf(cs []comment.Comment) []comment.ID {
	out := make([]comment.ID, len(cs))
	for i, c := range cs {
		out[i] = c.ID
	}
	return out
}
