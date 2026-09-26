import { useCallback, useEffect, useMemo, useState } from "react";
import { createCommentClient, type CommentClient } from "./api";
import { CommentForm } from "./CommentForm";
import { addReply, removeComment } from "./tree";
import type { Comment } from "./types";

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

export function CommentThread({
  threadKey,
  client: givenClient,
  getVerificationToken,
  maxDepth = 5,
  onPosted,
}: CommentThreadProps) {
  const client = useMemo(() => givenClient ?? createCommentClient(), [givenClient]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextBefore, setNextBefore] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    client
      .thread(threadKey, 0)
      .then((page) => {
        if (cancelled) return;
        setComments(page.comments);
        setNextBefore(page.nextBefore);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
    };
  }, [client, threadKey]);

  const post = useCallback(
    async (body: string, authorName: string, parentId: number) => {
      const turnstileToken = getVerificationToken ? await getVerificationToken() : "";
      const created = await client.post(threadKey, { body, authorName, parentId, turnstileToken });
      setComments((cs) => (parentId ? addReply(cs, parentId, created) : [created, ...cs]));
      onPosted?.(created);
    },
    [client, threadKey, getVerificationToken, onPosted],
  );

  const remove = useCallback(
    async (id: number) => {
      await client.remove(id);
      setComments((cs) => removeComment(cs, id));
    },
    [client],
  );

  async function loadOlder() {
    const page = await client.thread(threadKey, nextBefore);
    setComments((cs) => [...cs, ...page.comments]);
    setNextBefore(page.nextBefore);
  }

  return (
    <section className="cmt-thread" aria-label="Comments">
      <CommentForm label="Add a comment" submitLabel="Post" showName onSubmit={(b, n) => post(b, n, 0)} />

      {status === "loading" && <p className="cmt-muted">Loading comments…</p>}
      {status === "failed" && <p className="cmt-muted">Comments couldn't be loaded.</p>}

      <ol className="cmt-list">
        {comments.map((c) => (
          <li key={c.id}>
            <CommentItem comment={c} maxDepth={maxDepth} onReply={post} onDelete={remove} />
          </li>
        ))}
      </ol>

      {nextBefore > 0 && (
        <button type="button" className="cmt-button cmt-button--quiet" onClick={loadOlder}>
          Load older comments
        </button>
      )}
    </section>
  );
}

interface ItemProps {
  comment: Comment;
  maxDepth: number;
  onReply(body: string, authorName: string, parentId: number): Promise<void>;
  onDelete(id: number): Promise<void>;
}

function CommentItem({ comment: c, maxDepth, onReply, onDelete }: ItemProps) {
  const [replying, setReplying] = useState(false);
  const removed = c.status === "removed";
  const author = removed ? "" : c.authorName || "Anonymous";
  const canReply = !removed && c.depth + 1 < maxDepth;

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

      {replying && (
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

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
