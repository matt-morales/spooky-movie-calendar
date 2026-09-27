// Side effects: call the API, then dispatch events with the results.
// The reducer stays pure; anything async lives here.
import type { Dispatch } from "react";
import type { Api } from "../lib/api";
import { moviesFailed, moviesLoaded, ratingFailed, ratingSaved, ratingSubmitted, type AppEvent } from "./events";

export async function loadMovies(dispatch: Dispatch<AppEvent>, api: Api, year: number) {
  try {
    const { movies, letterboxdListUrl } = await api.lineup(year);
    dispatch(moviesLoaded(year, movies, letterboxdListUrl));
  } catch (e) {
    dispatch(moviesFailed(String(e)));
  }
}

export async function rateMovie(
  dispatch: Dispatch<AppEvent>,
  api: Api,
  { movieId, value, previous }: { movieId: string; value: number; previous: number | null },
) {
  dispatch(ratingSubmitted(movieId, value));
  try {
    const { average, count } = await api.rate(movieId, value);
    dispatch(ratingSaved(movieId, { average, count }));
  } catch (e) {
    dispatch(ratingFailed(movieId, previous, String(e)));
  }
}
