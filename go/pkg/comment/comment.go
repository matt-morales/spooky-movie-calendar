// Package comment is a reusable, threaded comment system.
//
// It follows a hexagonal layout: this package is the core (domain rules and
// the Service use cases) and declares the ports it needs (Store, Verifier,
// Clock). Adapters live in subpackages: postgres (Store), memstore (Store for
// tests), turnstile (Verifier) and httpapi (the driving HTTP adapter).
//
// Comments attach to any "thread key" chosen by the host app, such as
// "movie:2025-07" or "post:hello-world". Threads are trees stored as an
// adjacency list (each comment has an optional parent).
package comment

import (
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type ID int64

type Status string

const (
	StatusVisible Status = "visible"
	StatusHidden  Status = "hidden"  // hidden by a moderator
	StatusDeleted Status = "deleted" // deleted by its author
	// StatusRemoved is what readers see for hidden or deleted comment.
	// It is never stored.
	StatusRemoved Status = "removed"
)

const (
	MaxBodyLen       = 2000
	MaxAuthorNameLen = 40
)

var (
	ErrInvalidThreadKey  = errors.New("invalid thread key")
	ErrEmptyBody         = errors.New("comment is empty")
	ErrBodyTooLong       = errors.New("comment is too long")
	ErrAuthorNameTooLong = errors.New("name is too long")
	ErrInvalidStatus     = errors.New("invalid status")
	ErrNotFound          = errors.New("comment not found")
	ErrParentNotFound    = errors.New("parent comment not found in this thread")
	ErrTooDeep           = errors.New("reply is nested too deeply")
	ErrRateLimited       = errors.New("too many comments, try again shortly")
	ErrNotHuman          = errors.New("human verification failed")
)

type Comment struct {
	ID         ID
	ThreadKey  string
	ParentID   ID // 0 for a top-level comment
	Depth      int
	AuthorID   string
	AuthorName string
	Body       string
	Status     Status
	CreatedAt  time.Time
}

// Node is a comment with its replies, as shown to readers.
type Node struct {
	Comment
	Replies []*Node
}

var threadKeyRE = regexp.MustCompile(`^[a-z0-9][a-z0-9:._-]{0,127}$`)

func ValidateThreadKey(key string) error {
	if !threadKeyRE.MatchString(key) {
		return ErrInvalidThreadKey
	}
	return nil
}

// NormalizeBody trims whitespace, normalizes line endings and enforces length.
func NormalizeBody(body string) (string, error) {
	body = strings.TrimSpace(strings.ReplaceAll(body, "\r\n", "\n"))
	switch n := utf8.RuneCountInString(body); {
	case n == 0:
		return "", ErrEmptyBody
	case n > MaxBodyLen:
		return "", ErrBodyTooLong
	}
	return body, nil
}

// NormalizeAuthorName trims the optional display name and enforces length.
func NormalizeAuthorName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > MaxAuthorNameLen {
		return "", ErrAuthorNameTooLong
	}
	return name, nil
}

func (s Status) Valid() bool {
	return s == StatusVisible || s == StatusHidden || s == StatusDeleted
}

// Public returns the comment as readers may see it: moderated comments keep
// their place in the thread but lose their content and author.
func (c Comment) Public() Comment {
	if c.Status == StatusVisible {
		return c
	}
	c.Body = ""
	c.AuthorName = ""
	c.AuthorID = ""
	c.Status = StatusRemoved
	return c
}

// BuildTree turns a flat list of comments into reader-facing trees.
//
// Top-level comments are ordered newest first, replies oldest first. Removed
// comments are redacted, and dropped entirely when nothing visible hangs off
// them. A comment whose parent is missing from the list becomes a root.
func BuildTree(flat []Comment) []*Node {
	nodes := make(map[ID]*Node, len(flat))
	for _, c := range flat {
		nodes[c.ID] = &Node{Comment: c.Public()}
	}

	var roots []*Node
	for _, c := range flat {
		n := nodes[c.ID]
		if parent, ok := nodes[c.ParentID]; ok && c.ParentID != 0 {
			parent.Replies = append(parent.Replies, n)
		} else {
			roots = append(roots, n)
		}
	}

	roots = prune(roots)
	sort.SliceStable(roots, func(i, j int) bool { return newer(roots[i], roots[j]) })
	for _, r := range roots {
		sortReplies(r)
	}
	return roots
}

// prune drops removed comments that have no surviving replies.
func prune(nodes []*Node) []*Node {
	kept := nodes[:0]
	for _, n := range nodes {
		n.Replies = prune(n.Replies)
		if n.Status != StatusRemoved || len(n.Replies) > 0 {
			kept = append(kept, n)
		}
	}
	return kept
}

func sortReplies(n *Node) {
	sort.SliceStable(n.Replies, func(i, j int) bool { return newer(n.Replies[j], n.Replies[i]) })
	for _, r := range n.Replies {
		sortReplies(r)
	}
}

func newer(a, b *Node) bool {
	if !a.CreatedAt.Equal(b.CreatedAt) {
		return a.CreatedAt.After(b.CreatedAt)
	}
	return a.ID > b.ID
}
