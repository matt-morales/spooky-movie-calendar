import { useState } from "react";
import type { CommentClient } from "./api";
import { CommentForm } from "./CommentForm";
import { EmojiTray, SmileIcon } from "./EmojiTray";
import type { Comment, Reaction } from "./types";
import { useCommentThread, type ThreadStatus } from "./useCommentThread";
import { fullTime, timeAgo, useNow } from "./when";

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
        onReact={thread.react}
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
  /** The reply form's label, e.g. "Your reply". */
  replyLabel?: string;
  /** Show the optional name field when replying, as when posting. */
  replyShowsName?: boolean;
  /** Toggles your emoji reaction; without it, reactions are shown read-only. */
  onReact?(id: number, emoji: string): Promise<void>;
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
  replyLabel = "Reply",
  replyShowsName = false,
  onDelete,
  onReact,
  onLoadOlder,
  emptyText,
  noun = "comments",
}: CommentListProps) {
  const now = useNow();
  return (
    <>
      {status === "loading" && <p className="cmt-muted">Loading {noun}…</p>}
      {status === "failed" && <p className="cmt-muted">{capitalize(noun)} couldn't be loaded.</p>}
      {status === "ready" && comments.length === 0 && emptyText && <p className="cmt-muted">{emptyText}</p>}

      <ol className="cmt-list">
        {comments.map((c) => (
          <li key={c.id}>
            <CommentItem
              comment={c}
              now={now}
              maxDepth={onReply ? maxDepth : 0}
              reply={{ label: replyLabel, showName: replyShowsName }}
              onReply={onReply}
              onDelete={onDelete}
              onReact={onReact}
            />
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
  now: number;
  maxDepth: number;
  reply: { label: string; showName: boolean };
  onReply?(body: string, authorName: string, parentId: number): Promise<void>;
  onDelete(id: number): Promise<void>;
  onReact?(id: number, emoji: string): Promise<void>;
}

function CommentItem({ comment: c, now, maxDepth, reply, onReply, onDelete, onReact }: ItemProps) {
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
            <time dateTime={c.createdAt} title={fullTime(c.createdAt)}>
              {timeAgo(c.createdAt, now)}
            </time>
          </header>
          <p className="cmt-body">{c.body}</p>
          {/* Reactions on the left, Reply and Delete on the right. */}
          <div className="cmt-footer">
            <Reactions
              reactions={c.reactions}
              onReact={onReact && ((emoji) => onReact(c.id, emoji).catch(() => {}))}
            />
            {(canReply || c.mine) && (
              <div className="cmt-actions cmt-item-actions">
                {canReply && (
                  <button
                    type="button"
                    className="cmt-link"
                    aria-expanded={replying}
                    onClick={() => setReplying((r) => !r)}
                  >
                    Reply
                  </button>
                )}
                {c.mine && (
                  <button type="button" className="cmt-link" onClick={() => onDelete(c.id)}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {replying && onReply && (
        <CommentForm
          label={reply.label}
          submitLabel="Post reply"
          showName={reply.showName}
          autoFocus
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
              <CommentItem
                comment={r}
                now={now}
                maxDepth={maxDepth}
                reply={reply}
                onReply={onReply}
                onDelete={onDelete}
                onReact={onReact}
              />
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

// Each emoji with its count, pressed when it's yours; then a button to add one.
function Reactions({ reactions, onReact }: { reactions: Reaction[]; onReact?: (emoji: string) => void }) {
  if (!onReact && reactions.length === 0) return null;
  return (
    <div className="cmt-reactions">
      {reactions.map((r) =>
        onReact ? (
          <button
            key={r.emoji}
            type="button"
            className="cmt-reaction"
            aria-pressed={r.mine}
            aria-label={`${r.emoji} ${r.count}${r.mine ? ", you reacted" : ""}`}
            onClick={() => onReact(r.emoji)}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="cmt-reaction-count">{r.count}</span>
          </button>
        ) : (
          <span key={r.emoji} className="cmt-reaction" aria-label={`${r.emoji} ${r.count}`}>
            <span aria-hidden="true">{r.emoji}</span>
            <span className="cmt-reaction-count">{r.count}</span>
          </span>
        ),
      )}
      {onReact && (
        <EmojiTray label="Add reaction" className="cmt-reaction cmt-reaction--add" onPick={onReact}>
          <SmileIcon />
          <span aria-hidden="true">+</span>
        </EmojiTray>
      )}
    </div>
  );
}
