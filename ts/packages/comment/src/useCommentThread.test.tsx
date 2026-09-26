import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentClient } from "./api";
import type { Comment } from "./types";
import { useCommentThread } from "./useCommentThread";

function comment(over: Partial<Comment>): Comment {
  return {
    id: 1,
    parentId: 0,
    depth: 0,
    authorName: "",
    body: "",
    status: "visible",
    mine: false,
    createdAt: "2025-10-01T20:00:00Z",
    replies: [],
    ...over,
  };
}

function fakeClient(initial: Comment[]): CommentClient {
  return {
    thread: vi.fn(async () => ({ comments: initial, nextBefore: 0 })),
    post: vi.fn(async (_key, input) => comment({ id: 99, body: input.body, mine: true })),
    remove: vi.fn(async () => undefined),
  };
}

describe("useCommentThread", () => {
  it("doesn't load until enabled", async () => {
    const client = fakeClient([comment({ id: 1, body: "Hi" })]);
    const { result, rerender } = renderHook(({ enabled }) => useCommentThread("movie:1", { client, enabled }), {
      initialProps: { enabled: false },
    });

    expect(client.thread).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.comments.map((c) => c.body)).toEqual(["Hi"]);
  });

  it("posts without loading the thread first", async () => {
    const client = fakeClient([]);
    const { result } = renderHook(() => useCommentThread("movie:1", { client, enabled: false }));

    await act(() => result.current.post({ body: "Great", authorName: "Ash", turnstileToken: "tok" }));

    expect(client.post).toHaveBeenCalledWith("movie:1", {
      body: "Great",
      authorName: "Ash",
      parentId: 0,
      turnstileToken: "tok",
    });
    expect(client.thread).not.toHaveBeenCalled();
    expect(result.current.comments.map((c) => c.body)).toEqual(["Great"]);
  });

  it("removes a comment", async () => {
    const client = fakeClient([comment({ id: 1, body: "Mine", mine: true })]);
    const { result } = renderHook(() => useCommentThread("movie:1", { client }));
    await waitFor(() => expect(result.current.comments).toHaveLength(1));

    await act(() => result.current.remove(1));

    expect(client.remove).toHaveBeenCalledWith(1);
    expect(result.current.comments).toEqual([]);
  });
});
