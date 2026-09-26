import { describe, expect, it } from "vitest";
import type { Movie } from "../lib/api";
import {
  calendarToggled,
  daySelected,
  moviesFailed,
  moviesLoaded,
  ratingFailed,
  ratingSaved,
  ratingSubmitted,
  watchedToggled,
  type AppEvent,
} from "./events";
import { createInitialState, dayFromHash, isWatched, reducer, selectRating, type AppState } from "./reducer";

const run = (events: AppEvent[], state: AppState = createInitialState()) => events.reduce(reducer, state);

const movie = (over: Partial<Movie>): Movie => ({
  id: "2025-01",
  year: 2025,
  day: 1,
  date: "2025-10-01",
  title: "Christine",
  directors: ["John Carpenter"],
  description: "",
  posterUrl: "",
  rating: { average: 0, count: 0, mine: null },
  ...over,
});

describe("reducer", () => {
  it("reads the starting day from the URL hash", () => {
    expect(dayFromHash("#movie-12")).toBe(12);
    expect(dayFromHash("#movie-99")).toBe(1);
    expect(dayFromHash("")).toBe(1);
  });

  it("stores loaded movies and seeds their ratings", () => {
    const s = run([
      moviesLoaded(2025, [
        movie({ id: "2025-01", rating: { average: 7, count: 2, mine: 8 } }),
        movie({ id: "2025-02", day: 2 }),
      ]),
    ]);
    expect(s.movies).toMatchObject({ status: "ready", year: 2025 });
    expect(s.movies.items.map((m) => m.id)).toEqual(["2025-01", "2025-02"]);
    expect(selectRating(s, "2025-01")).toMatchObject({ mine: 8, summary: { average: 7, count: 2 } });
    expect(selectRating(s, "2025-02").summary).toEqual({ average: 0, count: 0 });
  });

  it("records a failed load", () => {
    expect(run([moviesFailed("offline")]).movies).toMatchObject({ status: "failed", error: "offline" });
  });

  it("selects days and toggles the calendar", () => {
    expect(run([daySelected(7), calendarToggled()]).calendar).toEqual({ selectedDay: 7, collapsed: true });
  });

  it("applies a rating optimistically then stores the new summary", () => {
    const s1 = run([moviesLoaded(2025, [movie({})]), ratingSubmitted("2025-01", 8)]);
    expect(selectRating(s1, "2025-01")).toMatchObject({ mine: 8, saving: true });

    const s2 = reducer(s1, ratingSaved("2025-01", { average: 7, count: 3 }));
    expect(selectRating(s2, "2025-01")).toMatchObject({ mine: 8, saving: false, summary: { average: 7, count: 3 } });
  });

  it("rolls back a rating that fails to save", () => {
    const s = run([ratingSubmitted("2025-01", 8), ratingFailed("2025-01", 4, "offline")]);
    expect(selectRating(s, "2025-01")).toMatchObject({ mine: 4, saving: false, error: "offline" });
  });

  it("unknown movies have an empty rating", () => {
    expect(selectRating(createInitialState(), "x")).toEqual({ mine: null, summary: null, saving: false, error: null });
  });

  it("toggles a movie as watched", () => {
    const s1 = run([watchedToggled("2025-01")]);
    expect(isWatched(s1, "2025-01")).toBe(true);
    expect(isWatched(s1, "2025-02")).toBe(false);
    expect(isWatched(reducer(s1, watchedToggled("2025-01")), "2025-01")).toBe(false);
  });

  it("starts with the watched movies it's given", () => {
    expect(isWatched(createInitialState("", ["2025-03"]), "2025-03")).toBe(true);
  });
});
