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
	"unicode"
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
	ErrInvalidEmoji      = errors.New("a reaction must be a single emoji")
	ErrTooManyReactions  = errors.New("this comment has as many different reactions as it can take")
)

// MaxReactionKinds caps how many different emoji one comment can collect;
// anyone can still join an existing reaction.
const MaxReactionKinds = 12

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

// Node is a comment with its replies and reactions, as shown to readers.
type Node struct {
	Comment
	Replies   []*Node
	Reactions []Reaction
}

// ReactionRow is one person's reaction to a comment, as stored.
type ReactionRow struct {
	CommentID ID
	AuthorID  string
	Emoji     string
	CreatedAt time.Time
}

// Reaction is one emoji on a comment: how many people used it, and who.
type Reaction struct {
	Emoji   string
	Count   int
	authors map[string]bool
}

// By reports whether authorID is one of the people who reacted.
func (r Reaction) By(authorID string) bool { return r.authors[authorID] }

// Reactions groups stored rows (oldest first) into one Reaction per emoji, in
// the order each emoji was first used.
func Reactions(rows []ReactionRow) []Reaction {
	var out []Reaction
	index := map[string]int{}
	for _, row := range rows {
		i, ok := index[row.Emoji]
		if !ok {
			i = len(out)
			index[row.Emoji] = i
			out = append(out, Reaction{Emoji: row.Emoji, authors: map[string]bool{}})
		}
		if !out[i].authors[row.AuthorID] {
			out[i].authors[row.AuthorID] = true
			out[i].Count++
		}
	}
	return out
}

// ValidateEmoji accepts exactly one emoji, including composed ones: skin
// tones, ZWJ sequences (👨‍👩‍👧), flags and keycaps. It counts emoji "bases";
// modifiers and ZWJ-joined parts attach to the base before them.
func ValidateEmoji(e string) error {
	if e == "" || len(e) > 64 || !utf8.ValidString(e) {
		return ErrInvalidEmoji
	}
	bases, pictographic, afterZWJ, regional := 0, false, false, 0
	for _, r := range e {
		switch {
		case r == 0x200D: // zero-width joiner
			afterZWJ = true
			continue
		case r == 0xFE0F || r == 0xFE0E || // variation selectors
			(r >= 0x1F3FB && r <= 0x1F3FF) || // skin tones
			(r >= 0xE0020 && r <= 0xE007F): // tag sequences (subdivision flags)
		case r == 0x20E3: // keycap: 1️⃣
			pictographic = true
		case r >= 0x1F1E6 && r <= 0x1F1FF: // regional indicators: two make a flag
			if regional%2 == 0 && !afterZWJ {
				bases++
			}
			regional++
			pictographic = true
		case unicode.In(r, unicode.So, unicode.Sm) || r == 0x203C || r == 0x2049 || r == 0x3030 || r == 0x303D:
			if !afterZWJ {
				bases++
			}
			pictographic = true
		case r >= '0' && r <= '9' || r == '#' || r == '*': // keycap bases
			if !afterZWJ {
				bases++
			}
		default: // letters, spaces, punctuation, controls
			return ErrInvalidEmoji
		}
		afterZWJ = false
	}
	if bases != 1 || !pictographic {
		return ErrInvalidEmoji
	}
	return nil
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
