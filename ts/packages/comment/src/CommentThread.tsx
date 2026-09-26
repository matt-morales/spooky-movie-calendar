import { useState } from "react";
import type { CommentClient } from "./api";
import { CommentForm } from "./CommentForm";
import type { Comment } from "./types";
import { useCommentThread, type ThreadStatus } from "./useCommentThread";

export interface CommentThreadProps {
  /** Anything the host app uses to identify a page, e.g. "movie:2025-07". */
  threadKey: string;
  /** Defaults to a client for the Go API mounted at /api. */
  client?: CommentClient;
  /** Returns a human-verification (Turnstile) token; see useTurnstile. */
  getVerificationToken?: () => Promise<string>;
  /** Must match the server's MaxDepth (default 5). */
  maxDepth?: number;
  /** Called after a comment is posted, e.g. for analytics. */
  onPosted?: (comment: Comment) => void;
}

export function CommentThread({ threadKey, client, getVerificationToken, maxDepth = 5, onPosted }: CommentThreadProps) {
  const thread = useCommentThread(threadKey, { client, onPosted });

  async function post(body: string, authorName: string, parentId: number) {
    const turnstileToken = getVerificationToken ? await getVerificationToken() : "";
    await thread.post({ body, authorName, parentId, turnstileToken });
  }

  return (
    <section className="cmt-thread" aria-label="Comments">
      <CommentForm label="Add a comment" submitLabel="Post" showName onSubmit={(b, n) => post(b, n, 0)} />
      <CommentList
        comments={thread.comments}
        status={thread.status}
        hasOlder={thread.hasOlder}
        maxDepth={maxDepth}
        onReply={post}
        onDelete={thread.remove}
        onLoadOlder={thread.loadOlder}
      />
    </section>
  );
}

export interface CommentListProps {
  comments: Comment[];
  status: ThreadStatus;
  hasOlder: boolean;
  /** Must match the server's MaxDepth. 1 gives a flat list with no replies. */
  maxDepth?: number;
  onReply?(body: string, authorName: string, parentId: number): Promise<void>;
  onDelete(id: number): Promise<void>;
  onLoadOlder(): Promise<void>;
  /** Shown once loaded when there are no comments. */
  emptyText?: string;
  noun?: string; // "comments", "reviews", …
}

export function CommentList({
  comments,
  status,
  hasOlder,
  maxDepth = 5,
  onReply,
  onDelete,
  onLoadOlder,
  emptyText,
  noun = "comments",
}: CommentListProps) {
  return (
    <>
      {status === "loading" && <p className="cmt-muted">Loading {noun}…</p>}
      {status === "failed" && <p className="cmt-muted">{capitalize(noun)} couldn't be loaded.</p>}
      {status === "ready" && comments.length === 0 && emptyText && <p className="cmt-muted">{emptyText}</p>}

      <ol className="cmt-list">
        {comments.map((c) => (
          <li key={c.id}>
            <CommentItem comment={c} maxDepth={onReply ? maxDepth : 0} onReply={onReply} onDelete={onDelete} />
          </li>
        ))}
      </ol>

      {hasOlder && (
        <button type="button" className="cmt-button cmt-button--quiet" onClick={onLoadOlder}>
          Load older {noun}
        </button>
      )}
    </>
  );
}

interface ItemProps {
  comment: Comment;
  maxDepth: number;
  onReply?(body: string, authorName: string, parentId: number): Promise<void>;
  onDelete(id: number): Promise<void>;
}

function CommentItem({ comment: c, maxDepth, onReply, onDelete }: ItemProps) {
  const [replying, setReplying] = useState(false);
  const removed = c.status === "removed";
  const author = removed ? "" : c.authorName || "Anonymous";
  const canReply = !!onReply && !removed && c.depth + 1 < maxDepth;

  return (
    <article className="cmt-item" aria-label={removed ? "Removed comment" : `Comment by ${author}`}>
      {removed ? (
        <p className="cmt-body cmt-muted">[removed]</p>
      ) : (
        <>
          <header className="cmt-meta">
            <span className="cmt-author">{author}</span>
            <time dateTime={c.createdAt}>{formatWhen(c.createdAt)}</time>
          </header>
          <p className="cmt-body">{c.body}</p>
          <div className="cmt-actions">
            {canReply && (
              <button type="button" className="cmt-link" onClick={() => setReplying((r) => !r)}>
                Reply
              </button>
            )}
            {c.mine && (
              <button type="button" className="cmt-link" onClick={() => onDelete(c.id)}>
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {replying && onReply && (
        <CommentForm
          label="Reply"
          submitLabel="Post reply"
          showName={false}
          onCancel={() => setReplying(false)}
          onSubmit={async (body, name) => {
            await onReply(body, name, c.id);
            setReplying(false);
          }}
        />
      )}

      {c.replies.length > 0 && (
        <ol className="cmt-list cmt-replies">
          {c.replies.map((r) => (
            <li key={r.id}>
              <CommentItem comment={r} maxDepth={maxDepth} onReply={onReply} onDelete={onDelete} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
