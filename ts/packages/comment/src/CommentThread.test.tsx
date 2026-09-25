import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentApiError, type CommentClient } from "./api";
import { CommentThread } from "./CommentThread";
import type { Comment } from "./types";

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

function fakeClient(initial: Comment[], over: Partial<CommentClient> = {}): CommentClient {
  let nextId = 100;
  return {
    thread: vi.fn(async () => ({ comments: initial, nextBefore: 0 })),
    post: vi.fn(async (_key, input) =>
      comment({
        id: nextId++,
        parentId: input.parentId,
        depth: input.parentId ? 1 : 0,
        body: input.body,
        authorName: input.authorName,
        mine: true,
      }),
    ),
    remove: vi.fn(async () => undefined),
    ...over,
  };
}

describe("CommentThread", () => {
  it("renders the thread as a nested tree", async () => {
    const client = fakeClient([
      comment({
        id: 1,
        authorName: "Laurie",
        body: "Top level",
        replies: [comment({ id: 2, parentId: 1, depth: 1, body: "A reply" })],
      }),
    ]);
    render(<CommentThread threadKey="movie:2025-01" client={client} />);

    const top = await screen.findByRole("article", { name: /Laurie/ });
    expect(within(top).getByText("Top level")).toBeInTheDocument();
    expect(within(top).getByText("A reply")).toBeInTheDocument();
    expect(client.thread).toHaveBeenCalledWith("movie:2025-01", 0);
  });

  it("posts a new top-level comment and shows it first", async () => {
    const user = userEvent.setup();
    const client = fakeClient([comment({ id: 1, body: "Older" })]);
    render(<CommentThread threadKey="movie:1" client={client} />);
    await screen.findByText("Older");

    await user.type(screen.getByLabelText("Your name (optional)"), "Sidney");
    await user.type(screen.getByLabelText("Add a comment"), "What's your favorite scary movie?");
    await user.click(screen.getByRole("button", { name: "Post" }));

    const articles = await screen.findAllByRole("article");
    expect(articles[0]).toHaveTextContent("What's your favorite scary movie?");
    expect(client.post).toHaveBeenCalledWith("movie:1", {
      body: "What's your favorite scary movie?",
      authorName: "Sidney",
      parentId: 0,
      turnstileToken: "",
    });
  });

  it("replies inline under the parent", async () => {
    const user = userEvent.setup();
    render(<CommentThread threadKey="movie:1" client={fakeClient([comment({ id: 1, authorName: "Nancy", body: "Parent" })])} />);

    const parent = await screen.findByRole("article", { name: /Nancy/ });
    await user.click(within(parent).getByRole("button", { name: "Reply" }));
    await user.type(within(parent).getByLabelText("Reply"), "Child");
    await user.click(within(parent).getByRole("button", { name: "Post reply" }));

    expect(await within(parent).findByText("Child")).toBeInTheDocument();
  });

  it("hides the reply button at the maximum depth", async () => {
    render(
      <CommentThread
        threadKey="movie:1"
        maxDepth={2}
        client={fakeClient([
          comment({ id: 1, authorName: "A", replies: [comment({ id: 2, parentId: 1, depth: 1, authorName: "B" })] }),
        ])}
      />,
    );
    const deepest = await screen.findByRole("article", { name: /B/ });
    expect(within(deepest).queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("lets authors delete their own comments", async () => {
    const user = userEvent.setup();
    const client = fakeClient([comment({ id: 1, body: "Mine", mine: true }), comment({ id: 2, body: "Theirs" })]);
    render(<CommentThread threadKey="movie:1" client={client} />);

    const theirs = await screen.findByText("Theirs");
    expect(within(theirs.closest("article")!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
    expect(client.remove).toHaveBeenCalledWith(1);
  });

  it("shows removed comments as placeholders", async () => {
    render(<CommentThread threadKey="movie:1" client={fakeClient([comment({ id: 1, status: "removed" })])} />);
    expect(await screen.findByText("[removed]")).toBeInTheDocument();
  });

  it("shows the server's message when posting fails", async () => {
    const user = userEvent.setup();
    const client = fakeClient([], {
      post: vi.fn(async () => {
        throw new CommentApiError(429, "rate_limited", "too many comments, try again shortly");
      }),
    });
    render(<CommentThread threadKey="movie:1" client={client} />);

    await user.type(await screen.findByLabelText("Add a comment"), "spam");
    await user.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("too many comments");
    expect(screen.getByLabelText("Add a comment")).toHaveValue("spam");
  });

  it("loads older comments on demand", async () => {
    const user = userEvent.setup();
    const thread = vi
      .fn()
      .mockResolvedValueOnce({ comments: [comment({ id: 5, body: "Newer" })], nextBefore: 5 })
      .mockResolvedValueOnce({ comments: [comment({ id: 3, body: "Older" })], nextBefore: 0 });
    render(<CommentThread threadKey="movie:1" client={fakeClient([], { thread })} />);

    await user.click(await screen.findByRole("button", { name: "Load older comments" }));

    expect(await screen.findByText("Older")).toBeInTheDocument();
    expect(screen.getByText("Newer")).toBeInTheDocument();
    expect(thread).toHaveBeenLastCalledWith("movie:1", 5);
    expect(screen.queryByRole("button", { name: "Load older comments" })).not.toBeInTheDocument();
  });

  it("passes the human-verification token when one is provided", async () => {
    const user = userEvent.setup();
    const client = fakeClient([]);
    render(<CommentThread threadKey="movie:1" client={client} getVerificationToken={async () => "tok-123"} />);

    await user.type(await screen.findByLabelText("Add a comment"), "hi");
    await user.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("movie:1", expect.objectContaining({ turnstileToken: "tok-123" })),
    );
  });
});
