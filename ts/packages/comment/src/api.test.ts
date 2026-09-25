import { describe, expect, it, vi } from "vitest";
import { CommentApiError, createCommentClient } from "./api";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("createCommentClient", () => {
  it("loads a thread, encoding the key and cursor", async () => {
    const fetch = fakeFetch(200, { comments: [], nextBefore: 0 });
    const client = createCommentClient({ baseUrl: "/api", fetch });

    const page = await client.thread("movie:2025-01", 42);

    expect(page).toEqual({ comments: [], nextBefore: 0 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/threads/movie%3A2025-01/comments?before=42",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("posts a comment as JSON", async () => {
    const created = { id: 1, body: "hi", replies: [] };
    const fetch = fakeFetch(201, created);
    const client = createCommentClient({ fetch });

    const got = await client.post("movie:1", { body: "hi", parentId: 0, authorName: "", turnstileToken: "t" });

    expect(got).toEqual(created);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/threads/movie%3A1/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "hi", parentId: 0, authorName: "", turnstileToken: "t" });
  });

  it("deletes a comment", async () => {
    const fetch = fakeFetch(204, undefined);
    await createCommentClient({ fetch }).remove(7);
    expect(fetch).toHaveBeenCalledWith("/api/comments/7", expect.objectContaining({ method: "DELETE" }));
  });

  it("turns error responses into CommentApiError", async () => {
    const fetch = fakeFetch(429, { error: { code: "rate_limited", message: "slow down" } });
    const err = await createCommentClient({ fetch })
      .post("movie:1", { body: "x", parentId: 0, authorName: "", turnstileToken: "" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CommentApiError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited", message: "slow down" });
  });
});
