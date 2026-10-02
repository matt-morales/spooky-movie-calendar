package comment

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestValidateThreadKey(t *testing.T) {
	valid := []string{"movie:2025-07", "post:hello-world", "a", "blog.post_1"}
	for _, k := range valid {
		if err := ValidateThreadKey(k); err != nil {
			t.Errorf("ValidateThreadKey(%q) = %v, want nil", k, err)
		}
	}
	invalid := []string{"", "Movie:1", "has space", ":leading", strings.Repeat("a", 129), "semi;colon"}
	for _, k := range invalid {
		if err := ValidateThreadKey(k); !errors.Is(err, ErrInvalidThreadKey) {
			t.Errorf("ValidateThreadKey(%q) = %v, want ErrInvalidThreadKey", k, err)
		}
	}
}

func TestNormalizeBody(t *testing.T) {
	got, err := NormalizeBody("  hello\r\nworld  ")
	if err != nil {
		t.Fatal(err)
	}
	if got != "hello\nworld" {
		t.Errorf("got %q", got)
	}

	if _, err := NormalizeBody("   \n "); !errors.Is(err, ErrEmptyBody) {
		t.Errorf("blank body: got %v, want ErrEmptyBody", err)
	}

	// Length is counted in characters, not bytes.
	if _, err := NormalizeBody(strings.Repeat("👻", MaxBodyLen)); err != nil {
		t.Errorf("max-length emoji body: %v", err)
	}
	if _, err := NormalizeBody(strings.Repeat("a", MaxBodyLen+1)); !errors.Is(err, ErrBodyTooLong) {
		t.Errorf("long body: got %v, want ErrBodyTooLong", err)
	}
}

func TestNormalizeAuthorName(t *testing.T) {
	got, err := NormalizeAuthorName("  Final Girl ")
	if err != nil || got != "Final Girl" {
		t.Errorf("got %q, %v", got, err)
	}
	if got, err := NormalizeAuthorName(""); err != nil || got != "" {
		t.Errorf("empty name should be allowed, got %q, %v", got, err)
	}
	if _, err := NormalizeAuthorName(strings.Repeat("x", MaxAuthorNameLen+1)); !errors.Is(err, ErrAuthorNameTooLong) {
		t.Errorf("got %v, want ErrAuthorNameTooLong", err)
	}
}

func TestPublicRedactsModeratedComments(t *testing.T) {
	c := Comment{ID: 1, AuthorName: "Ghostface", Body: "spam", Status: StatusHidden}
	p := c.Public()
	if p.Body != "" || p.AuthorName != "" || p.Status != StatusRemoved {
		t.Errorf("hidden comment leaked: %+v", p)
	}

	c.Status = StatusVisible
	if p := c.Public(); p.Body != "spam" || p.Status != StatusVisible {
		t.Errorf("visible comment was altered: %+v", p)
	}
}

func at(min int) time.Time { return time.Date(2025, 10, 1, 0, min, 0, 0, time.UTC) }

func TestBuildTree(t *testing.T) {
	flat := []Comment{
		{ID: 1, Body: "root old", CreatedAt: at(1), Status: StatusVisible},
		{ID: 2, Body: "root new", CreatedAt: at(2), Status: StatusVisible},
		{ID: 4, ParentID: 1, Depth: 1, Body: "second reply", CreatedAt: at(4), Status: StatusVisible},
		{ID: 3, ParentID: 1, Depth: 1, Body: "first reply", CreatedAt: at(3), Status: StatusVisible},
		{ID: 5, ParentID: 3, Depth: 2, Body: "nested", CreatedAt: at(5), Status: StatusVisible},
	}

	roots := BuildTree(flat)

	// Newest conversations first; replies read top-to-bottom oldest first.
	if len(roots) != 2 || roots[0].ID != 2 || roots[1].ID != 1 {
		t.Fatalf("root order = %v, want [2 1]", ids(roots))
	}
	replies := roots[1].Replies
	if len(replies) != 2 || replies[0].ID != 3 || replies[1].ID != 4 {
		t.Fatalf("reply order = %v, want [3 4]", ids(replies))
	}
	if n := replies[0].Replies; len(n) != 1 || n[0].ID != 5 {
		t.Fatalf("nested = %v, want [5]", ids(n))
	}
}

func TestBuildTreeKeepsRemovedParentsThatHaveReplies(t *testing.T) {
	flat := []Comment{
		{ID: 1, Body: "rude", Status: StatusHidden, CreatedAt: at(1)},
		{ID: 2, ParentID: 1, Depth: 1, Body: "reply", Status: StatusVisible, CreatedAt: at(2)},
		{ID: 3, Body: "deleted, no replies", Status: StatusDeleted, CreatedAt: at(3)},
	}

	roots := BuildTree(flat)

	if len(roots) != 1 || roots[0].ID != 1 {
		t.Fatalf("roots = %v, want only [1]", ids(roots))
	}
	if roots[0].Status != StatusRemoved || roots[0].Body != "" {
		t.Errorf("removed parent not redacted: %+v", roots[0].Comment)
	}
	if len(roots[0].Replies) != 1 {
		t.Errorf("reply under removed parent was lost")
	}
}

func TestBuildTreePromotesOrphansToRoots(t *testing.T) {
	roots := BuildTree([]Comment{{ID: 9, ParentID: 404, Depth: 1, Status: StatusVisible}})
	if len(roots) != 1 || roots[0].ID != 9 {
		t.Fatalf("orphan dropped: %v", ids(roots))
	}
}

func ids(nodes []*Node) []ID {
	out := make([]ID, len(nodes))
	for i, n := range nodes {
		out[i] = n.ID
	}
	return out
}

func TestValidateEmoji(t *testing.T) {
	for _, e := range []string{"😱", "💀", "☠️", "❤️", "👍🏽", "👨‍👩‍👧", "🇳🇿", "1️⃣", "🏳️‍🌈"} {
		if err := ValidateEmoji(e); err != nil {
			t.Errorf("ValidateEmoji(%q) = %v, want ok", e, err)
		}
	}
	for _, e := range []string{"", "a", "lol", "😱😱", " 😱", "😱 ", "<b>", "1", ":skull:", strings.Repeat("😱", 20)} {
		if err := ValidateEmoji(e); !errors.Is(err, ErrInvalidEmoji) {
			t.Errorf("ValidateEmoji(%q) = %v, want ErrInvalidEmoji", e, err)
		}
	}
}
