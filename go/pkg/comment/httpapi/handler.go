// Package httpapi is the driving HTTP adapter for the comment service.
//
// Routes (under a prefix such as "/api"):
//
//	GET    {prefix}/threads/{key}/comments?before=ID   a page of the thread as a tree
//	POST   {prefix}/threads/{key}/comments             post a comment or reply
//	DELETE {prefix}/comments/{id}                      delete your own comment
//	PUT    {prefix}/comments/{id}/reactions/{emoji}    react (emoji URL-encoded)
//	DELETE {prefix}/comments/{id}/reactions/{emoji}    take your reaction back
//
// The host app decides who the caller is via an Identity function, so this
// package works with cookies, sessions, JWTs or anything else.
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
)

// Identity returns the caller's stable author ID, or ok=false if unknown.
type Identity func(r *http.Request) (authorID string, ok bool)

type Handler struct {
	svc      *comment.Service
	identity Identity
	clientIP func(*http.Request) string
}

type Option func(*Handler)

// WithClientIP overrides how the caller's IP is found (it is passed to the
// human verifier). The default uses X-Client-IP (set by the Cloudflare Pages
// proxy), then CF-Connecting-IP, then RemoteAddr.
func WithClientIP(fn func(*http.Request) string) Option {
	return func(h *Handler) { h.clientIP = fn }
}

func New(svc *comment.Service, identity Identity, opts ...Option) *Handler {
	h := &Handler{svc: svc, identity: identity, clientIP: defaultClientIP}
	for _, o := range opts {
		o(h)
	}
	return h
}

func (h *Handler) Register(mux *http.ServeMux, prefix string) {
	mux.HandleFunc("GET "+prefix+"/threads/{key}/comments", h.thread)
	mux.HandleFunc("POST "+prefix+"/threads/{key}/comments", h.post)
	mux.HandleFunc("DELETE "+prefix+"/comments/{id}", h.delete)
	mux.HandleFunc("PUT "+prefix+"/comments/{id}/reactions/{emoji}", h.react(true))
	mux.HandleFunc("DELETE "+prefix+"/comments/{id}/reactions/{emoji}", h.react(false))
}

type commentJSON struct {
	ID         comment.ID     `json:"id"`
	ParentID   comment.ID     `json:"parentId"`
	Depth      int            `json:"depth"`
	AuthorName string         `json:"authorName"`
	Body       string         `json:"body"`
	Status     comment.Status `json:"status"`
	Mine       bool           `json:"mine"`
	CreatedAt  time.Time      `json:"createdAt"`
	Replies    []commentJSON  `json:"replies"`
	Reactions  []reactionJSON `json:"reactions"`
}

// reactionJSON says how many people used an emoji and whether the viewer
// did, never who.
type reactionJSON struct {
	Emoji string `json:"emoji"`
	Count int    `json:"count"`
	Mine  bool   `json:"mine"`
}

func toReactionsJSON(rs []comment.Reaction, viewer string) []reactionJSON {
	out := make([]reactionJSON, len(rs))
	for i, r := range rs {
		out[i] = reactionJSON{Emoji: r.Emoji, Count: r.Count, Mine: viewer != "" && r.By(viewer)}
	}
	return out
}

func toJSON(n *comment.Node, viewer string) commentJSON {
	out := commentJSON{
		ID: n.ID, ParentID: n.ParentID, Depth: n.Depth, AuthorName: n.AuthorName, Body: n.Body,
		Status: n.Status, Mine: viewer != "" && n.AuthorID == viewer, CreatedAt: n.CreatedAt.UTC(),
		Replies:   make([]commentJSON, 0, len(n.Replies)),
		Reactions: toReactionsJSON(n.Reactions, viewer),
	}
	for _, r := range n.Replies {
		out.Replies = append(out.Replies, toJSON(r, viewer))
	}
	return out
}

func (h *Handler) thread(w http.ResponseWriter, r *http.Request) {
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	page, err := h.svc.Thread(r.Context(), r.PathValue("key"), comment.ID(before))
	if err != nil {
		writeError(w, r, err)
		return
	}
	viewer, _ := h.identity(r)
	out := struct {
		Comments   []commentJSON `json:"comments"`
		NextBefore comment.ID    `json:"nextBefore"`
	}{Comments: make([]commentJSON, 0, len(page.Comments)), NextBefore: page.NextBefore}
	for _, n := range page.Comments {
		out.Comments = append(out.Comments, toJSON(n, viewer))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) post(w http.ResponseWriter, r *http.Request) {
	author, ok := h.identity(r)
	if !ok {
		writeError(w, r, errUnauthenticated)
		return
	}
	var in struct {
		ParentID       comment.ID `json:"parentId"`
		Body           string     `json:"body"`
		AuthorName     string     `json:"authorName"`
		TurnstileToken string     `json:"turnstileToken"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		writeError(w, r, errBadRequest)
		return
	}
	c, err := h.svc.Post(r.Context(), comment.PostInput{
		ThreadKey:         r.PathValue("key"),
		ParentID:          in.ParentID,
		AuthorID:          author,
		AuthorName:        in.AuthorName,
		Body:              in.Body,
		VerificationToken: in.TurnstileToken,
		RemoteIP:          h.clientIP(r),
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toJSON(&comment.Node{Comment: c}, author))
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	author, ok := h.identity(r)
	if !ok {
		writeError(w, r, errUnauthenticated)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, r, comment.ErrNotFound)
		return
	}
	if err := h.svc.DeleteOwn(r.Context(), comment.ID(id), author); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) react(on bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		author, ok := h.identity(r)
		if !ok {
			writeError(w, r, errUnauthenticated)
			return
		}
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			writeError(w, r, comment.ErrNotFound)
			return
		}
		reactions, err := h.svc.React(r.Context(), comment.ID(id), author, r.PathValue("emoji"), on)
		if err != nil {
			writeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"reactions": toReactionsJSON(reactions, author)})
	}
}

var (
	errUnauthenticated = errors.New("no visitor identity")
	errBadRequest      = errors.New("request body is not valid JSON")
)

var errorCodes = []struct {
	err    error
	status int
	code   string
}{
	{errUnauthenticated, http.StatusUnauthorized, "unauthenticated"},
	{errBadRequest, http.StatusBadRequest, "bad_request"},
	{comment.ErrInvalidThreadKey, http.StatusBadRequest, "invalid_thread_key"},
	{comment.ErrEmptyBody, http.StatusUnprocessableEntity, "empty_body"},
	{comment.ErrBodyTooLong, http.StatusUnprocessableEntity, "body_too_long"},
	{comment.ErrAuthorNameTooLong, http.StatusUnprocessableEntity, "author_name_too_long"},
	{comment.ErrParentNotFound, http.StatusUnprocessableEntity, "parent_not_found"},
	{comment.ErrTooDeep, http.StatusUnprocessableEntity, "too_deep"},
	{comment.ErrNotHuman, http.StatusForbidden, "not_human"},
	{comment.ErrRateLimited, http.StatusTooManyRequests, "rate_limited"},
	{comment.ErrNotFound, http.StatusNotFound, "not_found"},
	{comment.ErrInvalidEmoji, http.StatusUnprocessableEntity, "invalid_emoji"},
	{comment.ErrTooManyReactions, http.StatusUnprocessableEntity, "too_many_reactions"},
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	for _, e := range errorCodes {
		if errors.Is(err, e.err) {
			writeJSON(w, e.status, errorBody(e.code, e.err.Error()))
			return
		}
	}
	slog.ErrorContext(r.Context(), "comment request failed", "err", err, "path", r.URL.Path)
	writeJSON(w, http.StatusInternalServerError, errorBody("internal", "something went wrong"))
}

func errorBody(code, msg string) any {
	return map[string]any{"error": map[string]string{"code": code, "message": msg}}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func defaultClientIP(r *http.Request) string {
	for _, h := range []string{"X-Client-IP", "CF-Connecting-IP"} {
		if ip := r.Header.Get(h); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
