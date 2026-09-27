import type { CommentClient, ThreadPage } from "@spooky/comment";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { Analytics } from "./lib/analytics";
import type { Api, Movie } from "./lib/api";
import { AppStateProvider } from "./state/AppState";

const movie = (day: number, title: string, over: Partial<Movie> = {}): Movie => ({
  id: `2025-${String(day).padStart(2, "0")}`,
  year: 2025,
  day,
  date: `2025-10-${String(day).padStart(2, "0")}`,
  title,
  directors: ["Someone"],
  description: `${title} description`,
  posterUrl: `https://images.test/${day}.jpg`,
  rating: { average: 0, count: 0, mine: null },
  ...over,
});

function setup(api: Partial<Api> = {}) {
  const calls: string[] = [];
  const services = {
    api: {
      lineup: vi.fn(async () => {
        calls.push("movies");
        return {
          movies: [
            movie(1, "Christine", { directors: ["John Carpenter"], rating: { average: 7, count: 2, mine: null } }),
            movie(2, "The Grudge"),
          ],
          letterboxdListUrl: "https://letterboxd.com/someone/list/2025/",
        };
      }),
      rate: vi.fn(async () => ({ average: 8, count: 3, mine: 10 })),
      ...api,
    },
    analytics: {
      pageView: vi.fn(async () => void calls.push("page_view")),
      track: vi.fn(),
      flushOnExit: vi.fn(),
    } satisfies Analytics,
    comments: {
      thread: vi.fn(async (): Promise<ThreadPage> => ({ comments: [], nextBefore: 0 })),
      post: vi.fn(async (_key, input) => ({
        id: 7,
        parentId: 0,
        depth: 0,
        authorName: input.authorName,
        body: input.body,
        status: "visible" as const,
        mine: true,
        createdAt: "2025-10-01T21:00:00Z",
        replies: [],
      })),
      remove: vi.fn(async () => undefined),
    } satisfies CommentClient,
  };
  render(
    <AppStateProvider services={services}>
      <App year={2025} />
    </AppStateProvider>,
  );
  return { ...services, calls };
}

// Open and close the flipped card instantly; the animation needs a real browser.
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
});

const cardFor = async (title: string) => (await screen.findByRole("heading", { name: title })).closest("article")!;

describe("App", () => {
  it("records the page view first, then loads the lineup", async () => {
    const { api, calls } = setup();

    const card = await cardFor("Christine");
    expect(calls).toEqual(["page_view", "movies"]);
    expect(api.lineup).toHaveBeenCalledWith(2025);
    expect(within(card).getByText("October 1st")).toBeInTheDocument();
    expect(within(card).getByText("John Carpenter")).toBeInTheDocument();
    expect(within(card).getByText("7/10")).toBeInTheDocument();
    expect(within(card).getByText("(2 ratings)")).toBeInTheDocument();
    expect(screen.getByText("October 2025")).toBeInTheDocument();
  });

  it("builds the calendar for the whole month, marking nights without a movie yet", async () => {
    setup();
    await screen.findByRole("heading", { name: "Christine" });
    const calendar = screen.getByRole("group", { name: "Choose a night" });
    const days = within(calendar).getAllByRole("button");
    expect(days.map((d) => d.textContent)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    expect(within(calendar).getByRole("button", { name: "3, no tape yet" })).toBeInTheDocument();
  });

  it("shows a missing tape for each night without a movie, alternating lines", async () => {
    setup();
    await screen.findByRole("heading", { name: "Christine" });

    const tapes = screen.getAllByRole("article", { name: "No signal" });
    expect(tapes).toHaveLength(29);
    expect(tapes[0]).toHaveTextContent("Tape 3: footage unrecovered.");
    expect(tapes[0]).toHaveTextContent("October 3rd");
    expect(tapes[1]).toHaveTextContent("The tape is blank. For now.");
    expect(document.getElementById("movie-31")).toContainElement(tapes[28]!);
  });

  it("links the sidebar to the year's Letterboxd list", async () => {
    setup();
    expect(await screen.findByRole("link", { name: "Letterboxd" })).toHaveAttribute(
      "href",
      "https://letterboxd.com/someone/list/2025/",
    );
  });

  it("shows an error when the lineup can't be loaded", async () => {
    setup({
      lineup: async () => {
        throw new Error("offline");
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });

  it("tracks calendar navigation", async () => {
    const user = userEvent.setup();
    const { analytics } = setup();
    await screen.findByRole("heading", { name: "Christine" });

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(analytics.track).toHaveBeenCalledWith("day_selected", { day: 2 });
  });

  it("marks a movie as watched, on the card and in the calendar", async () => {
    const user = userEvent.setup();
    setup();
    const card = await cardFor("Christine");

    await user.click(within(card).getByRole("button", { name: "Mark as watched" }));

    expect(within(card).getByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true");
    const calendar = screen.getByRole("group", { name: "Choose a night" });
    expect(within(calendar).getByRole("button", { name: "1, watched" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("watched_movies")!)).toEqual(["2025-01"]);
  });

  it("rates and reviews a movie from the review modal", async () => {
    const user = userEvent.setup();
    const { api, comments } = setup();
    const card = await cardFor("Christine");

    await user.click(within(card).getByRole("button", { name: "Add your review" }));
    const modal = screen.getByRole("dialog", { name: "Review Christine" });

    await user.click(within(modal).getByRole("button", { name: "Rate 5 drops" }));
    expect(api.rate).toHaveBeenCalledWith("2025-01", 10);
    expect(await within(card).findByText("8/10")).toBeInTheDocument();

    await user.type(within(modal).getByLabelText("Your name (optional)"), "Arnie");
    await user.type(within(modal).getByLabelText("Your review"), "Never trust a Plymouth Fury.");
    await user.click(within(modal).getByRole("button", { name: "Post review" }));

    expect(comments.post).toHaveBeenCalledWith("movie:2025-01", {
      body: "Never trust a Plymouth Fury.",
      authorName: "Arnie",
      parentId: 0,
      turnstileToken: "",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes the review modal with Escape", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(within(await cardFor("Christine")).getByRole("button", { name: "Add your review" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("turns a card over to show its reviews when clicked", async () => {
    const user = userEvent.setup();
    const { comments } = setup();
    vi.mocked(comments.thread).mockResolvedValue({
      comments: [
        {
          id: 3,
          parentId: 0,
          depth: 0,
          authorName: "Leigh",
          body: "Scared of my own car now.",
          status: "visible",
          mine: false,
          createdAt: "2025-10-01T21:00:00Z",
          replies: [],
        },
      ],
      nextBefore: 0,
    });
    const card = await cardFor("Christine");
    expect(comments.thread).not.toHaveBeenCalled();

    await user.click(within(card).getByText("Christine description"));

    const detail = screen.getByRole("dialog", { name: "Christine" });
    expect(comments.thread).toHaveBeenCalledWith("movie:2025-01", 0);
    const review = await within(detail).findByRole("article", { name: "Comment by Leigh" });
    expect(review).toHaveTextContent("Scared of my own car now.");
    expect(within(review).queryByRole("button", { name: "Reply" })).not.toBeInTheDocument(); // reviews are flat

    await user.click(within(detail).getByRole("button", { name: "Close reviews" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("doesn't turn the card over for its own buttons", async () => {
    const user = userEvent.setup();
    const { comments } = setup();
    const card = await cardFor("Christine");

    await user.click(within(card).getByRole("button", { name: "Mark as watched" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(comments.thread).not.toHaveBeenCalled();
  });
});
