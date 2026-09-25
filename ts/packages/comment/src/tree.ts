import type { Comment } from "./types";

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
