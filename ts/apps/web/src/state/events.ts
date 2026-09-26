// Every state change in the app is one of these events.
// Events describe what happened (past tense), not what to do.
import type { Movie } from "../lib/api";

export interface Summary {
  average: number;
  count: number;
}

export type AppEvent =
  | { type: "movies/loaded"; year: number; movies: Movie[] }
  | { type: "movies/failed"; error: string }
  | { type: "calendar/daySelected"; day: number }
  | { type: "calendar/toggled" }
  | { type: "ratings/submitted"; movieId: string; value: number }
  | { type: "ratings/saved"; movieId: string; summary: Summary }
  | { type: "ratings/failed"; movieId: string; previous: number | null; error: string }
  | { type: "watched/toggled"; movieId: string };

export const moviesLoaded = (year: number, movies: Movie[]): AppEvent => ({ type: "movies/loaded", year, movies });
export const moviesFailed = (error: string): AppEvent => ({ type: "movies/failed", error });

export const daySelected = (day: number): AppEvent => ({ type: "calendar/daySelected", day });
export const calendarToggled = (): AppEvent => ({ type: "calendar/toggled" });

export const ratingSubmitted = (movieId: string, value: number): AppEvent => ({
  type: "ratings/submitted",
  movieId,
  value,
});
export const ratingSaved = (movieId: string, summary: Summary): AppEvent => ({
  type: "ratings/saved",
  movieId,
  summary,
});
export const ratingFailed = (movieId: string, previous: number | null, error: string): AppEvent => ({
  type: "ratings/failed",
  movieId,
  previous,
  error,
});

export const watchedToggled = (movieId: string): AppEvent => ({ type: "watched/toggled", movieId });
