// Package memstore is an in-memory comment.Store for tests and local demos.
package memstore

import (
	"context"
	"slices"
	"sort"
	"sync"
	"time"

	"github.com/matt-morales/spooky-movie-calendar/go/pkg/comment"
)

type Store struct {
	mu        sync.Mutex
	nextID    comment.ID
	byID      map[comment.ID]comment.Comment
	reactions []comment.ReactionRow // in insertion order
}

func New() *Store {
	return &Store{byID: map[comment.ID]comment.Comment{}}
}

func (s *Store) Insert(_ context.Context, c comment.Comment) (comment.Comment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	c.ID = s.nextID
	s.byID[c.ID] = c
	return c, nil
}

func (s *Store) Get(_ context.Context, id comment.ID) (comment.Comment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.byID[id]
	if !ok {
		return comment.Comment{}, comment.ErrNotFound
	}
	return c, nil
}

func (s *Store) ListThread(_ context.Context, key string, before comment.ID, limit int) ([]comment.Comment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var roots []comment.Comment
	children := map[comment.ID][]comment.Comment{}
	for _, c := range s.byID {
		if c.ThreadKey != key {
			continue
		}
		if c.ParentID == 0 {
			if before == 0 || c.ID < before {
				roots = append(roots, c)
			}
		} else {
			children[c.ParentID] = append(children[c.ParentID], c)
		}
	}
	sort.Slice(roots, func(i, j int) bool { return roots[i].ID > roots[j].ID })
	if len(roots) > limit {
		roots = roots[:limit]
	}

	var out []comment.Comment
	var walk func(c comment.Comment)
	walk = func(c comment.Comment) {
		out = append(out, c)
		for _, child := range children[c.ID] {
			walk(child)
		}
	}
	for _, r := range roots {
		walk(r)
	}
	return out, nil
}

func (s *Store) CountByAuthorSince(_ context.Context, authorID string, since time.Time) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, c := range s.byID {
		if c.AuthorID == authorID && !c.CreatedAt.Before(since) {
			n++
		}
	}
	return n, nil
}

func (s *Store) SetStatus(_ context.Context, id comment.ID, status comment.Status) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.byID[id]
	if !ok {
		return comment.ErrNotFound
	}
	c.Status = status
	s.byID[id] = c
	return nil
}

func (s *Store) AddReaction(_ context.Context, r comment.ReactionRow) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, have := range s.reactions {
		if have.CommentID == r.CommentID && have.AuthorID == r.AuthorID && have.Emoji == r.Emoji {
			return nil
		}
	}
	s.reactions = append(s.reactions, r)
	return nil
}

func (s *Store) RemoveReaction(_ context.Context, id comment.ID, authorID, emoji string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reactions = slices.DeleteFunc(s.reactions, func(r comment.ReactionRow) bool {
		return r.CommentID == id && r.AuthorID == authorID && r.Emoji == emoji
	})
	return nil
}

func (s *Store) ListReactions(_ context.Context, ids []comment.ID) ([]comment.ReactionRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []comment.ReactionRow
	for _, r := range s.reactions {
		if slices.Contains(ids, r.CommentID) {
			out = append(out, r)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (s *Store) CountTopLevel(_ context.Context, threadKeys []string) (map[string]int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]int{}
	for _, c := range s.byID {
		if c.Status == comment.StatusVisible && c.ParentID == 0 && slices.Contains(threadKeys, c.ThreadKey) {
			out[c.ThreadKey]++
		}
	}
	return out, nil
}
