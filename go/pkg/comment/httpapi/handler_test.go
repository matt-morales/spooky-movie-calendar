package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/httpapi"
	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment/memstore"
)

type verifier struct{ err error }

func (v verifier) Verify(context.Context, string, string) error { return v.err }

func newServer(t *testing.T, v comment.Verifier) *http.ServeMux {
	t.Helper()
	svc := comment.NewService(memstore.New(), v)
	identity := func(r *http.Request) (string, bool) {
		id := r.Header.Get("X-Visitor")
		return id, id != ""
	}
	mux := http.NewServeMux()
	httpapi.New(svc, identity).Register(mux, "/api")
	return mux
}

func do(t *testing.T, h http.Handler, method, path, visitor, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if visitor != "" {
		req.Header.Set("X-Visitor", visitor)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

type commentJSON struct {
	ID         int64         `json:"id"`
	ParentID   int64         `json:"parentId"`
	Depth      int           `json:"depth"`
	AuthorName string        `json:"authorName"`
	Body       string        `json:"body"`
	Status     string        `json:"status"`
	Mine       bool          `json:"mine"`
	Replies    []commentJSON `json:"replies"`
}

func TestPostAndReadThread(t *testing.T) {
	h := newServer(t, verifier{})

	rec := do(t, h, "POST", "/api/threads/movie:2025-01/comments", "v1",
		`{"body":"Christine is a mood","authorName":"Arnie","turnstileToken":"ok"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("post status = %d, body %s", rec.Code, rec.Body)
	}
	var root commentJSON
	json.NewDecoder(rec.Body).Decode(&root)

	rec = do(t, h, "POST", "/api/threads/movie:2025-01/comments", "v2",
		`{"body":"agreed","parentId":`+itoa(root.ID)+`,"turnstileToken":"ok"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("reply status = %d, body %s", rec.Code, rec.Body)
	}

	rec = do(t, h, "GET", "/api/threads/movie:2025-01/comments", "v1", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d", rec.Code)
	}
	var page struct {
		Comments   []commentJSON `json:"comments"`
		NextBefore int64         `json:"nextBefore"`
	}
	json.NewDecoder(rec.Body).Decode(&page)
	if len(page.Comments) != 1 || len(page.Comments[0].Replies) != 1 {
		t.Fatalf("unexpected tree: %+v", page)
	}
	got := page.Comments[0]
	if got.AuthorName != "Arnie" || !got.Mine || got.Replies[0].Mine {
		t.Errorf("author/mine wrong: %+v", got)
	}
	if strings.Contains(rec.Body.String(), "v1") {
		t.Errorf("author id leaked in response: %s", rec.Body)
	}
}

func TestErrorsMapToStatusCodes(t *testing.T) {
	cases := []struct {
		name     string
		verifier comment.Verifier
		visitor  string
		path     string
		body     string
		want     int
		code     string
	}{
		{"no visitor", verifier{}, "", "/api/threads/movie:1/comments", `{"body":"x"}`, 401, "unauthenticated"},
		{"bad json", verifier{}, "v", "/api/threads/movie:1/comments", `{`, 400, "bad_request"},
		{"bad key", verifier{}, "v", "/api/threads/BAD/comments", `{"body":"x"}`, 400, "invalid_thread_key"},
		{"empty body", verifier{}, "v", "/api/threads/movie:1/comments", `{"body":"  "}`, 422, "empty_body"},
		{"too long", verifier{}, "v", "/api/threads/movie:1/comments", `{"body":"` + strings.Repeat("a", 2001) + `"}`, 422, "body_too_long"},
		{"missing parent", verifier{}, "v", "/api/threads/movie:1/comments", `{"body":"x","parentId":42}`, 422, "parent_not_found"},
		{"bot", verifier{comment.ErrNotHuman}, "v", "/api/threads/movie:1/comments", `{"body":"x"}`, 403, "not_human"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(t, newServer(t, tc.verifier), "POST", tc.path, tc.visitor, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tc.want, rec.Body)
			}
			var e struct {
				Error struct{ Code, Message string } `json:"error"`
			}
			json.NewDecoder(rec.Body).Decode(&e)
			if e.Error.Code != tc.code || e.Error.Message == "" {
				t.Errorf("error = %+v, want code %q", e.Error, tc.code)
			}
		})
	}
}

func TestRateLimitReturns429(t *testing.T) {
	h := newServer(t, verifier{})
	var last *httptest.ResponseRecorder
	for range comment.DefaultConfig.RateLimit + 1 {
		last = do(t, h, "POST", "/api/threads/movie:1/comments", "v", `{"body":"spam"}`)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", last.Code)
	}
}

func TestDeleteOwnComment(t *testing.T) {
	h := newServer(t, verifier{})
	rec := do(t, h, "POST", "/api/threads/movie:1/comments", "owner", `{"body":"oops"}`)
	var c commentJSON
	json.NewDecoder(rec.Body).Decode(&c)
	path := "/api/comments/" + itoa(c.ID)

	if rec := do(t, h, "DELETE", path, "stranger", ""); rec.Code != http.StatusNotFound {
		t.Errorf("stranger delete = %d, want 404", rec.Code)
	}
	if rec := do(t, h, "DELETE", path, "owner", ""); rec.Code != http.StatusNoContent {
		t.Errorf("owner delete = %d, want 204", rec.Code)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func TestClientIPComesFromTheEdgeProxy(t *testing.T) {
	var gotIP string
	svc := comment.NewService(memstore.New(), comment.VerifierFunc(func(_ context.Context, _, ip string) error {
		gotIP = ip
		return nil
	}))
	mux := http.NewServeMux()
	httpapi.New(svc, func(*http.Request) (string, bool) { return "v", true }).Register(mux, "/api")

	req := httptest.NewRequest("POST", "/api/threads/movie:1/comments", strings.NewReader(`{"body":"hi"}`))
	req.Header.Set("X-Client-IP", "198.51.100.4")
	mux.ServeHTTP(httptest.NewRecorder(), req)

	if gotIP != "198.51.100.4" {
		t.Errorf("verifier got IP %q", gotIP)
	}
}
