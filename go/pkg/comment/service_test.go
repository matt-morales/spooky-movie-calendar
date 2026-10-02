package comment_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/memstore"
)

type fakeVerifier struct {
	calls int
	err   error
}

func (f *fakeVerifier) Verify(ctx context.Context, token, remoteIP string) error {
	f.calls++
	return f.err
}

type fixture struct {
	svc      *comment.Service
	store    *memstore.Store
	verifier *fakeVerifier
	now      time.Time
	posted   []comment.Comment
}

func newFixture(t *testing.T, cfg comment.Config) *fixture {
	t.Helper()
	f := &fixture{
		store:    memstore.New(),
		verifier: &fakeVerifier{},
		now:      time.Date(2025, 10, 31, 23, 0, 0, 0, time.UTC),
	}
	f.svc = comment.NewService(f.store, f.verifier,
		comment.WithConfig(cfg),
		comment.WithClock(func() time.Time { return f.now }),
		comment.WithOnPosted(func(_ context.Context, c comment.Comment) { f.posted = append(f.posted, c) }),
	)
	return f
}

func (f *fixture) post(t *testing.T, in comment.PostInput) comment.Comment {
	t.Helper()
	if in.ThreadKey == "" {
		in.ThreadKey = "movie:2025-31"
	}
	if in.AuthorID == "" {
		in.AuthorID = "visitor-1"
	}
	if in.Body == "" {
		in.Body = "boo"
	}
	c, err := f.svc.Post(context.Background(), in)
	if err != nil {
		t.Fatalf("Post: %v", err)
	}
	return c
}

func TestPostTopLevelComment(t *testing.T) {
	f := newFixture(t, comment.Config{})

	c := f.post(t, comment.PostInput{AuthorName: " Laurie ", Body: " Happy Halloween! "})

	if c.ID == 0 || c.Depth != 0 || c.ParentID != 0 {
		t.Errorf("unexpected identity/position: %+v", c)
	}
	if c.Body != "Happy Halloween!" || c.AuthorName != "Laurie" {
		t.Errorf("input not normalized: %+v", c)
	}
	if c.Status != comment.StatusVisible || !c.CreatedAt.Equal(f.now) {
		t.Errorf("status/time wrong: %+v", c)
	}
	if len(f.posted) != 1 || f.posted[0].ID != c.ID {
		t.Errorf("OnPosted hook not called with the new comment")
	}
}

func TestPostRejectsInvalidInputBeforeVerifying(t *testing.T) {
	f := newFixture(t, comment.Config{})
	ctx := context.Background()

	_, err := f.svc.Post(ctx, comment.PostInput{ThreadKey: "Bad Key", AuthorID: "v", Body: "x"})
	if !errors.Is(err, comment.ErrInvalidThreadKey) {
		t.Errorf("got %v, want ErrInvalidThreadKey", err)
	}
	_, err = f.svc.Post(ctx, comment.PostInput{ThreadKey: "movie:1", AuthorID: "v", Body: "  "})
	if !errors.Is(err, comment.ErrEmptyBody) {
		t.Errorf("got %v, want ErrEmptyBody", err)
	}
	if f.verifier.calls != 0 {
		t.Errorf("verifier called %d times for invalid input", f.verifier.calls)
	}
}

func TestPostRequiresHumanVerification(t *testing.T) {
	f := newFixture(t, comment.Config{})
	f.verifier.err = comment.ErrNotHuman

	_, err := f.svc.Post(context.Background(), comment.PostInput{
		ThreadKey: "movie:1", AuthorID: "bot", Body: "buy stuff", VerificationToken: "nope",
	})
	if !errors.Is(err, comment.ErrNotHuman) {
		t.Fatalf("got %v, want ErrNotHuman", err)
	}
	page, _ := f.svc.Thread(context.Background(), "movie:1", 0)
	if len(page.Comments) != 0 {
		t.Errorf("unverified comment was stored")
	}
}

func TestReplySetsDepth(t *testing.T) {
	f := newFixture(t, comment.Config{})
	root := f.post(t, comment.PostInput{})
	reply := f.post(t, comment.PostInput{ParentID: root.ID})
	nested := f.post(t, comment.PostInput{ParentID: reply.ID})

	if reply.Depth != 1 || nested.Depth != 2 {
		t.Errorf("depths = %d, %d; want 1, 2", reply.Depth, nested.Depth)
	}
}

func TestReplyMustBeInSameThread(t *testing.T) {
	f := newFixture(t, comment.Config{})
	other := f.post(t, comment.PostInput{ThreadKey: "movie:2025-01"})

	_, err := f.svc.Post(context.Background(), comment.PostInput{
		ThreadKey: "movie:2025-02", AuthorID: "v", Body: "hi", ParentID: other.ID,
	})
	if !errors.Is(err, comment.ErrParentNotFound) {
		t.Errorf("got %v, want ErrParentNotFound", err)
	}

	_, err = f.svc.Post(context.Background(), comment.PostInput{
		ThreadKey: "movie:2025-02", AuthorID: "v", Body: "hi", ParentID: 999,
	})
	if !errors.Is(err, comment.ErrParentNotFound) {
		t.Errorf("missing parent: got %v, want ErrParentNotFound", err)
	}
}

func TestReplyDepthLimit(t *testing.T) {
	f := newFixture(t, comment.Config{MaxDepth: 2})
	root := f.post(t, comment.PostInput{})
	reply := f.post(t, comment.PostInput{ParentID: root.ID})

	_, err := f.svc.Post(context.Background(), comment.PostInput{
		ThreadKey: root.ThreadKey, AuthorID: "v", Body: "too deep", ParentID: reply.ID,
	})
	if !errors.Is(err, comment.ErrTooDeep) {
		t.Errorf("got %v, want ErrTooDeep", err)
	}
}

func TestRateLimitPerAuthor(t *testing.T) {
	f := newFixture(t, comment.Config{RateLimit: 2, RateWindow: time.Minute})
	f.post(t, comment.PostInput{})
	f.post(t, comment.PostInput{})

	_, err := f.svc.Post(context.Background(), comment.PostInput{ThreadKey: "movie:1", AuthorID: "visitor-1", Body: "3rd"})
	if !errors.Is(err, comment.ErrRateLimited) {
		t.Fatalf("got %v, want ErrRateLimited", err)
	}

	// Someone else is unaffected.
	f.post(t, comment.PostInput{AuthorID: "visitor-2"})

	// And the limit resets once the window passes.
	f.now = f.now.Add(time.Minute + time.Second)
	f.post(t, comment.PostInput{})
}

func TestThreadReturnsTreeAndPages(t *testing.T) {
	f := newFixture(t, comment.Config{PageSize: 2, RateLimit: 100})
	r1 := f.post(t, comment.PostInput{Body: "first"})
	f.post(t, comment.PostInput{Body: "reply", ParentID: r1.ID})
	r2 := f.post(t, comment.PostInput{Body: "second"})
	r3 := f.post(t, comment.PostInput{Body: "third"})

	page, err := f.svc.Thread(context.Background(), "movie:2025-31", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Comments) != 2 || page.Comments[0].ID != r3.ID || page.Comments[1].ID != r2.ID {
		t.Fatalf("first page wrong: %+v", page.Comments)
	}
	if page.NextBefore != r2.ID {
		t.Fatalf("NextBefore = %d, want %d", page.NextBefore, r2.ID)
	}

	page, err = f.svc.Thread(context.Background(), "movie:2025-31", page.NextBefore)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Comments) != 1 || page.Comments[0].ID != r1.ID || len(page.Comments[0].Replies) != 1 {
		t.Fatalf("second page wrong: %+v", page.Comments)
	}
	if page.NextBefore != 0 {
		t.Errorf("NextBefore = %d on last page, want 0", page.NextBefore)
	}
}

func TestThreadRejectsBadKey(t *testing.T) {
	f := newFixture(t, comment.Config{})
	if _, err := f.svc.Thread(context.Background(), "NOPE", 0); !errors.Is(err, comment.ErrInvalidThreadKey) {
		t.Errorf("got %v", err)
	}
}

func TestModerate(t *testing.T) {
	f := newFixture(t, comment.Config{})
	c := f.post(t, comment.PostInput{Body: "rude"})
	ctx := context.Background()

	if err := f.svc.Moderate(ctx, c.ID, comment.StatusHidden); err != nil {
		t.Fatal(err)
	}
	page, _ := f.svc.Thread(ctx, c.ThreadKey, 0)
	if len(page.Comments) != 0 {
		t.Errorf("hidden comment still listed")
	}

	if err := f.svc.Moderate(ctx, c.ID, comment.StatusRemoved); !errors.Is(err, comment.ErrInvalidStatus) {
		t.Errorf("got %v, want ErrInvalidStatus", err)
	}
	if err := f.svc.Moderate(ctx, 999, comment.StatusHidden); !errors.Is(err, comment.ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func TestAuthorCanDeleteOnlyTheirOwnComment(t *testing.T) {
	f := newFixture(t, comment.Config{})
	c := f.post(t, comment.PostInput{AuthorID: "owner"})
	ctx := context.Background()

	if err := f.svc.DeleteOwn(ctx, c.ID, "someone-else"); !errors.Is(err, comment.ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
	if err := f.svc.DeleteOwn(ctx, c.ID, "owner"); err != nil {
		t.Fatal(err)
	}
	got, _ := f.store.Get(ctx, c.ID)
	if got.Status != comment.StatusDeleted {
		t.Errorf("status = %s, want deleted", got.Status)
	}
}

func TestVerifierFuncAdaptsPlainFunctions(t *testing.T) {
	var gotToken, gotIP string
	v := comment.VerifierFunc(func(_ context.Context, token, ip string) error {
		gotToken, gotIP = token, ip
		return comment.ErrNotHuman
	})
	svc := comment.NewService(memstore.New(), v)

	_, err := svc.Post(context.Background(), comment.PostInput{
		ThreadKey: "movie:1", AuthorID: "v", Body: "hi", VerificationToken: "tok", RemoteIP: "203.0.113.1",
	})
	if !errors.Is(err, comment.ErrNotHuman) || gotToken != "tok" || gotIP != "203.0.113.1" {
		t.Fatalf("err=%v token=%q ip=%q", err, gotToken, gotIP)
	}
}

func TestReactAddsAndRemovesAVisitorsReaction(t *testing.T) {
	f := newFixture(t, comment.Config{})
	c := f.post(t, comment.PostInput{AuthorID: "author"})
	ctx := context.Background()

	if _, err := f.svc.React(ctx, c.ID, "v1", "😱", true); err != nil {
		t.Fatal(err)
	}
	f.now = f.now.Add(time.Minute)
	f.svc.React(ctx, c.ID, "v2", "😱", true)
	f.svc.React(ctx, c.ID, "v2", "💀", true)
	got, err := f.svc.React(ctx, c.ID, "v1", "😱", true) // twice: still one
	if err != nil {
		t.Fatal(err)
	}
	// In order of first use, with who reacted.
	if len(got) != 2 || got[0].Emoji != "😱" || got[0].Count != 2 || !got[0].By("v1") || got[0].By("v3") ||
		got[1].Emoji != "💀" || got[1].Count != 1 || !got[1].By("v2") {
		t.Fatalf("reactions = %+v", got)
	}

	got, _ = f.svc.React(ctx, c.ID, "v2", "💀", false)
	if len(got) != 1 || got[0].Emoji != "😱" {
		t.Errorf("after removing 💀: %+v", got)
	}
}

func TestReactValidates(t *testing.T) {
	f := newFixture(t, comment.Config{})
	ctx := context.Background()
	c := f.post(t, comment.PostInput{AuthorID: "author"})
	hidden := f.post(t, comment.PostInput{AuthorID: "author"})
	f.svc.Moderate(ctx, hidden.ID, comment.StatusHidden)

	cases := []struct {
		id    comment.ID
		emoji string
		want  error
	}{
		{c.ID, "lol", comment.ErrInvalidEmoji},
		{999, "😱", comment.ErrNotFound},
		{hidden.ID, "😱", comment.ErrNotFound}, // removed comments take no reactions
	}
	for _, tc := range cases {
		if _, err := f.svc.React(ctx, tc.id, "v1", tc.emoji, true); !errors.Is(err, tc.want) {
			t.Errorf("React(%d, %q) = %v, want %v", tc.id, tc.emoji, err, tc.want)
		}
	}
	if _, err := f.svc.React(ctx, c.ID, "", "😱", true); err == nil {
		t.Errorf("React with no visitor should fail")
	}
}

func TestReactLimitsDistinctEmojiPerComment(t *testing.T) {
	f := newFixture(t, comment.Config{})
	ctx := context.Background()
	c := f.post(t, comment.PostInput{AuthorID: "author"})
	emoji := []string{"😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙"}
	for i, e := range emoji[:comment.MaxReactionKinds] {
		if _, err := f.svc.React(ctx, c.ID, fmt.Sprintf("v%d", i), e, true); err != nil {
			t.Fatalf("reaction %d: %v", i, err)
		}
	}
	if _, err := f.svc.React(ctx, c.ID, "v99", "💀", true); !errors.Is(err, comment.ErrTooManyReactions) {
		t.Errorf("a new kind past the limit: %v, want ErrTooManyReactions", err)
	}
	// Joining an existing reaction is always fine.
	if _, err := f.svc.React(ctx, c.ID, "v99", emoji[0], true); err != nil {
		t.Errorf("joining an existing reaction: %v", err)
	}
}

func TestThreadIncludesReactions(t *testing.T) {
	f := newFixture(t, comment.Config{})
	ctx := context.Background()
	c := f.post(t, comment.PostInput{AuthorID: "author"})
	other := f.post(t, comment.PostInput{AuthorID: "author"})
	f.svc.React(ctx, c.ID, "v1", "🎃", true)

	page, err := f.svc.Thread(ctx, "movie:2025-31", 0)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[comment.ID]*comment.Node{}
	for _, n := range page.Comments {
		byID[n.ID] = n
	}
	if r := byID[c.ID].Reactions; len(r) != 1 || r[0].Emoji != "🎃" || !r[0].By("v1") {
		t.Errorf("reactions on c = %+v", r)
	}
	if r := byID[other.ID].Reactions; len(r) != 0 {
		t.Errorf("reactions on other = %+v", r)
	}
}

func TestCountsVisibleCommentsPerThread(t *testing.T) {
	f := newFixture(t, comment.Config{})
	ctx := context.Background()
	f.post(t, comment.PostInput{AuthorID: "a", ThreadKey: "movie:2025-01"})
	f.post(t, comment.PostInput{AuthorID: "b", ThreadKey: "movie:2025-01"})
	got, err := f.svc.Counts(ctx, []string{"movie:2025-01", "movie:2025-02"})
	if err != nil {
		t.Fatal(err)
	}
	if got["movie:2025-01"] != 2 || got["movie:2025-02"] != 0 {
		t.Errorf("Counts = %v", got)
	}
	if _, err := f.svc.Counts(ctx, []string{"BAD KEY"}); !errors.Is(err, comment.ErrInvalidThreadKey) {
		t.Errorf("bad key: %v", err)
	}
}
