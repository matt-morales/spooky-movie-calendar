import type { Comment, Reaction } from "./types";

// Immutable helpers for updating a comment tree in React state.

export function addReply(comments: Comment[], parentId: number, reply: Comment): Comment[] {
  return comments.map((c) =>
    c.id === parentId
      ? { ...c, replies: [...c.replies, reply] }
      : { ...c, replies: addReply(c.replies, parentId, reply) },
  );
}

// removeComment mirrors the server: a removed comment with replies becomes a
// placeholder, one without replies disappears.
export function removeComment(comments: Comment[], id: number): Comment[] {
  return comments.flatMap((c) => {
    if (c.id === id) {
      return c.replies.length > 0 ? [{ ...c, status: "removed" as const, body: "", authorName: "", mine: false }] : [];
    }
    return [{ ...c, replies: removeComment(c.replies, id) }];
  });
}

export function setReactions(comments: Comment[], id: number, reactions: Reaction[]): Comment[] {
  return comments.map((c) =>
    c.id === id ? { ...c, reactions } : { ...c, replies: setReactions(c.replies, id, reactions) },
  );
}

export function findComment(comments: Comment[], id: number): Comment | undefined {
  for (const c of comments) {
    if (c.id === id) return c;
    const found = findComment(c.replies, id);
    if (found) return found;
  }
  return undefined;
}

/** Your reaction with emoji toggled: joined (count + 1) or taken back (count − 1). */
export function toggleReaction(reactions: Reaction[], emoji: string): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) return [...reactions, { emoji, count: 1, mine: true }];
  return reactions
    .map((r) => (r.emoji !== emoji ? r : { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) }))
    .filter((r) => r.count > 0);
}
