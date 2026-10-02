import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentApiError, type CommentClient } from "./api";
import { CommentForm } from "./CommentForm";
import { CommentList, CommentThread } from "./CommentThread";
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
    reactions: [],
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
    react: vi.fn(async () => []),
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
    expect(within(parent).getByLabelText("Reply")).toHaveFocus(); // ready to type
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

describe("CommentList", () => {
  const noop = async () => {};

  it("renders a flat list with no reply buttons at depth 1", () => {
    render(
      <CommentList
        comments={[comment({ id: 1, authorName: "Ash", body: "Groovy" })]}
        status="ready"
        hasOlder={false}
        maxDepth={1}
        onReply={noop}
        onDelete={noop}
        onLoadOlder={noop}
      />,
    );
    const item = screen.getByRole("article", { name: /Ash/ });
    expect(within(item).getByText("Groovy")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("uses the host's wording for empty and paged lists", () => {
    render(
      <CommentList
        comments={[]}
        status="ready"
        hasOlder
        noun="reviews"
        emptyText="No reviews yet."
        onDelete={noop}
        onLoadOlder={noop}
      />,
    );
    expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load older reviews" })).toBeInTheDocument();
  });
});

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const listProps = { status: "ready" as const, hasOlder: false, onDelete: async () => {}, onLoadOlder: async () => {} };

describe("review times", () => {
  it("says how long ago, with the exact time on hover", () => {
    render(<CommentList {...listProps} comments={[comment({ authorName: "Leigh", createdAt: minutesAgo(5) })]} />);
    const time = screen.getByText("5 minutes ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("title", expect.stringMatching(/\d{4}/)); // the full date and time
  });

  it("counts up from just now, and shows the date after a week", () => {
    render(
      <CommentList
        {...listProps}
        comments={[
          comment({ id: 1, authorName: "A", createdAt: new Date().toISOString() }),
          comment({ id: 2, authorName: "B", createdAt: minutesAgo(60 * 26) }),
          comment({ id: 3, authorName: "C", createdAt: "2025-10-01T12:00:00Z" }), // midday: Oct 1 in any time zone near ours
        ]}
      />,
    );
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("yesterday")).toBeInTheDocument();
    expect(screen.getByText(/Oct 1, 2025|1 Oct 2025/)).toBeInTheDocument();
  });
});

describe("reactions", () => {
  it("shows each emoji's count and lets you join or leave it", async () => {
    const user = userEvent.setup();
    const onReact = vi.fn(async () => {});
    render(
      <CommentList
        {...listProps}
        onReact={onReact}
        comments={[comment({ id: 7, authorName: "Leigh", reactions: [{ emoji: "😱", count: 2, mine: true }, { emoji: "💀", count: 1, mine: false }] })]}
      />,
    );
    const scream = screen.getByRole("button", { name: "😱 2, you reacted" });
    expect(scream).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "💀 1" })).toHaveAttribute("aria-pressed", "false");

    await user.click(scream);
    expect(onReact).toHaveBeenCalledWith(7, "😱");
  });

  it("adds a new reaction from the emoji tray", async () => {
    const user = userEvent.setup();
    const onReact = vi.fn(async () => {});
    render(<CommentList {...listProps} onReact={onReact} comments={[comment({ id: 7, authorName: "Leigh" })]} />);

    await user.click(screen.getByRole("button", { name: "Add reaction" }));
    const tray = await screen.findByRole("dialog", { name: "Pick an emoji" });
    await user.type(within(tray).getByRole("searchbox"), "ghost");
    await user.click(await within(tray).findByRole("button", { name: "ghost" }));

    expect(onReact).toHaveBeenCalledWith(7, "👻");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pick an emoji" })).not.toBeInTheDocument());
  });

  it("focuses the tray's search on desktops, but not on touch screens (no keyboard over the tray)", async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    const props = { ...listProps, onReact: async () => {}, comments: [comment({ id: 7, authorName: "Leigh" })] };
    try {
      for (const touch of [false, true]) {
        window.matchMedia = vi.fn((q: string) => ({ matches: touch && q === "(pointer: coarse)" }) as MediaQueryList);
        const { unmount } = render(<CommentList {...props} />);
        await user.click(screen.getByRole("button", { name: "Add reaction" }));
        const tray = await screen.findByRole("dialog", { name: "Pick an emoji" });
        const search = within(tray).getByRole("searchbox");
        if (touch) {
          expect(search).not.toHaveFocus();
          expect(tray).toContainElement(document.activeElement as HTMLElement);
        } else {
          expect(search).toHaveFocus();
        }
        unmount();
      }
    } finally {
      window.matchMedia = original;
    }
  });

  it("gives removed comments no reactions", () => {
    render(
      <CommentList
        {...listProps}
        onReact={async () => {}}
        comments={[comment({ status: "removed", reactions: [{ emoji: "😱", count: 1, mine: false }], replies: [comment({ id: 2, parentId: 1, depth: 1 })] })]}
      />,
    );
    expect(screen.queryByRole("button", { name: /😱/ })).not.toBeInTheDocument();
  });
});

describe("emoji in the form", () => {
  function setup() {
    const onSubmit = vi.fn(async () => {});
    render(<CommentForm label="Your review" submitLabel="Post review" showName={false} onSubmit={onSubmit} />);
    return { box: screen.getByLabelText("Your review") as HTMLTextAreaElement, onSubmit };
  }

  it("inserts an emoji from the tray where the cursor is", async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, "That ending");
    box.setSelectionRange(4, 4);

    await user.click(screen.getByRole("button", { name: "Add emoji" }));
    const tray = await screen.findByRole("dialog", { name: "Pick an emoji" });
    await user.type(within(tray).getByRole("searchbox"), "jack-o-lantern");
    await user.click(await within(tray).findByRole("button", { name: "jack-o-lantern" }));

    expect(box.value).toBe("That🎃 ending");
    expect(box).toHaveFocus();
  });

  it("suggests emoji after a colon, like Slack", async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, "So good :scre");

    const list = await screen.findByRole("listbox", { name: "Emoji suggestions" });
    const first = within(list).getAllByRole("option")[0]!;
    expect(first).toHaveTextContent("😱");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(box).toHaveAttribute("aria-controls", list.id);
    expect(box).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{Enter}");
    expect(box.value).toBe("So good 😱 ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves through suggestions with the arrow keys, and Escape closes them", async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, ":skul");
    const list = await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}");
    expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box.value).toBe(":skul");
  });

  it("turns a whole :name: into its emoji", async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, "rip :skull:");
    await waitFor(() => expect(box.value).toBe("rip 💀"));
  });

  it("doesn't submit while picking a suggestion with Enter", async () => {
    const user = userEvent.setup();
    const { box, onSubmit } = setup();
    await user.type(box, ":ghos");
    await screen.findByRole("listbox");
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box.value).toBe("👻 ");
  });
});
