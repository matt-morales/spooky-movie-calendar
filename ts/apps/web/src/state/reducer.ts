import type { Movie } from "../lib/api";
import type { AppEvent, Summary } from "./events";

export interface RatingState {
  mine: number | null;
  summary: Summary | null;
  saving: boolean;
  error: string | null;
}

export interface AppState {
  movies: { status: "loading" | "ready" | "failed"; year: number | null; items: Movie[]; error: string | null };
  calendar: { selectedDay: number; collapsed: boolean };
  ratings: Record<string, RatingState>;
  watched: string[]; // movie IDs this visitor has marked as watched
}

const EMPTY_RATING: RatingState = { mine: null, summary: null, saving: false, error: null };

// Read the starting day from a "#movie-12" style URL hash.
export function dayFromHash(hash: string): number {
  const m = hash.match(/#movie-(\d{1,2})/);
  const d = m?.[1] ? parseInt(m[1], 10) : 1;
  return d >= 1 && d <= 31 ? d : 1;
}

export function createInitialState(hash = "", watched: string[] = []): AppState {
  return {
    movies: { status: "loading", year: null, items: [], error: null },
    calendar: { selectedDay: dayFromHash(hash), collapsed: false },
    ratings: {},
    watched,
  };
}

function updateRating(state: AppState, movieId: string, patch: Partial<RatingState>): AppState {
  const current = state.ratings[movieId] ?? EMPTY_RATING;
  return { ...state, ratings: { ...state.ratings, [movieId]: { ...current, ...patch } } };
}

export function reducer(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "movies/loaded": {
      const ratings: Record<string, RatingState> = {};
      for (const m of event.movies) {
        ratings[m.id] = {
          ...EMPTY_RATING,
          mine: m.rating.mine,
          summary: { average: m.rating.average, count: m.rating.count },
        };
      }
      return {
        ...state,
        movies: { status: "ready", year: event.year, items: event.movies, error: null },
        ratings,
      };
    }

    case "movies/failed":
      return { ...state, movies: { ...state.movies, status: "failed", error: event.error } };

    case "calendar/daySelected":
      return { ...state, calendar: { ...state.calendar, selectedDay: event.day } };

    case "calendar/toggled":
      return { ...state, calendar: { ...state.calendar, collapsed: !state.calendar.collapsed } };

    // Optimistic: show the new rating immediately while it saves.
    case "ratings/submitted":
      return updateRating(state, event.movieId, { mine: event.value, saving: true, error: null });

    case "ratings/saved":
      return updateRating(state, event.movieId, { summary: event.summary, saving: false });

    // Roll back to the rating we had before the failed save.
    case "ratings/failed":
      return updateRating(state, event.movieId, { mine: event.previous, saving: false, error: event.error });

    case "watched/toggled": {
      const { watched } = state;
      return {
        ...state,
        watched: watched.includes(event.movieId)
          ? watched.filter((id) => id !== event.movieId)
          : [...watched, event.movieId],
      };
    }
  }
}

export const selectRating = (state: AppState, movieId: string): RatingState =>
  state.ratings[movieId] ?? EMPTY_RATING;

export const isWatched = (state: AppState, movieId: string): boolean => state.watched.includes(movieId);
