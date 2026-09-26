import type { CommentClient } from "@spooky/comment";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
      movies: vi.fn(async () => {
        calls.push("movies");
        return [
          movie(1, "Christine", { directors: ["John Carpenter"], rating: { average: 7, count: 2, mine: null } }),
          movie(2, "The Grudge"),
        ];
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
      thread: vi.fn(async () => ({ comments: [], nextBefore: 0 })),
      post: vi.fn(),
      remove: vi.fn(),
    } satisfies CommentClient,
  };
  render(
    <AppStateProvider services={services}>
      <App year={2025} />
    </AppStateProvider>,
  );
  return { ...services, calls };
}

describe("App", () => {
  it("records the page view first, then loads the lineup", async () => {
    const { api, calls } = setup();

    expect(await screen.findByRole("heading", { name: "Christine" })).toBeInTheDocument();
    expect(calls).toEqual(["page_view", "movies"]);
    expect(api.movies).toHaveBeenCalledWith(2025);
    expect(screen.getByText("October 1st")).toBeInTheDocument();
    expect(screen.getByText("Directed by John Carpenter")).toBeInTheDocument();
    expect(screen.getByText("October 2025")).toBeInTheDocument();
    expect(screen.getByText("Average rating: 3.5 (2)")).toBeInTheDocument();
  });

  it("builds the calendar from the lineup", async () => {
    setup();
    await screen.findByRole("heading", { name: "Christine" });
    const days = within(screen.getByRole("group", { name: "Choose a night" })).getAllByRole("button");
    expect(days.map((d) => d.textContent).sort()).toEqual(["1", "2"]);
  });

  it("shows an error when the lineup can't be loaded", async () => {
    setup({
      movies: async () => {
        throw new Error("offline");
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });

  it("rates a movie and shows the new average", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    const card = (await screen.findByRole("heading", { name: "Christine" })).closest("article")!;

    await user.click(within(card).getByRole("button", { name: "Rate 5 drops" }));

    expect(api.rate).toHaveBeenCalledWith("2025-01", 10);
    expect(await within(card).findByText("Average rating: 4.0 (3)")).toBeInTheDocument();
  });

  it("tracks calendar navigation", async () => {
    const user = userEvent.setup();
    const { analytics } = setup();
    await screen.findByRole("heading", { name: "Christine" });

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(analytics.track).toHaveBeenCalledWith("day_selected", { day: 2 });
  });

  it("opens a movie's comments on demand", async () => {
    const user = userEvent.setup();
    const { comments } = setup();
    const card = (await screen.findByRole("heading", { name: "Christine" })).closest("article")!;
    expect(comments.thread).not.toHaveBeenCalled();

    await user.click(within(card).getByRole("button", { name: /comments/i }));

    await waitFor(() => expect(comments.thread).toHaveBeenCalledWith("movie:2025-01", 0));
    expect(within(card).getByLabelText("Add a comment")).toBeInTheDocument();
  });
});
