// Mirrors the JSON from go/pkg/comment/httpapi.

export type CommentStatus = "visible" | "removed";

export interface Comment {
  id: number;
  parentId: number; // 0 for top-level
  depth: number;
  authorName: string;
  body: string;
  status: CommentStatus;
  mine: boolean;
  createdAt: string; // ISO 8601
  replies: Comment[];
  reactions: Reaction[]; // in order of first use
}

/** One emoji on a comment: how many people used it, and whether you did. */
export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ThreadPage {
  comments: Comment[];
  nextBefore: number; // pass to thread() for older comments; 0 = none
}

export interface PostInput {
  body: string;
  parentId: number;
  authorName: string;
  turnstileToken: string;
}
