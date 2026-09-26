import { useCallback, useEffect, useMemo, useState } from "react";
import { createCommentClient, type CommentClient } from "./api";
import { addReply, removeComment } from "./tree";
import type { Comment } from "./types";

export interface UseCommentThreadOptions {
  /** Defaults to a client for the Go API mounted at /api. */
  client?: CommentClient;
  /** Load the thread only while true, e.g. once a visitor opens it. Default true. */
  enabled?: boolean;
  /** Called after a comment is posted, e.g. for analytics. */
  onPosted?: (comment: Comment) => void;
}

export interface PostArgs {
  body: string;
  authorName: string;
  parentId?: number; // 0 or omitted for top-level
  turnstileToken?: string;
}

export type ThreadStatus = "idle" | "loading" | "ready" | "failed";

/**
 * The state behind a comment thread, for apps that lay out the form and the
 * list separately (see CommentThread for the all-in-one component). Posting
 * works before the thread has loaded; the new comment is shown first.
 */
export function useCommentThread(threadKey: string, { client: givenClient, enabled = true, onPosted }: UseCommentThreadOptions = {}) {
  const client = useMemo(() => givenClient ?? createCommentClient(), [givenClient]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextBefore, setNextBefore] = useState(0);
  const [status, setStatus] = useState<ThreadStatus>("idle");

  useEffect(() => {
    if (!enabled) return;
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
  }, [client, threadKey, enabled]);

  const post = useCallback(
    async ({ body, authorName, parentId = 0, turnstileToken = "" }: PostArgs) => {
      const created = await client.post(threadKey, { body, authorName, parentId, turnstileToken });
      setComments((cs) => (parentId ? addReply(cs, parentId, created) : [created, ...cs]));
      onPosted?.(created);
      return created;
    },
    [client, threadKey, onPosted],
  );

  const remove = useCallback(
    async (id: number) => {
      await client.remove(id);
      setComments((cs) => removeComment(cs, id));
    },
    [client],
  );

  const loadOlder = useCallback(async () => {
    const page = await client.thread(threadKey, nextBefore);
    setComments((cs) => [...cs, ...page.comments]);
    setNextBefore(page.nextBefore);
  }, [client, threadKey, nextBefore]);

  return { comments, status, hasOlder: nextBefore > 0, post, remove, loadOlder };
}
