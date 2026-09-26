import { useEffect } from "react";
import Calendar from "./components/Calendar";
import MovieCard from "./components/MovieCard";
import Sidebar from "./components/Sidebar";
import { useAppState, useDispatch, useServices } from "./state/AppState";
import { loadMovies } from "./state/effects";
import "./App.css";

export default function App({ year }: { year: number }) {
  const { movies } = useAppState();
  const dispatch = useDispatch();
  const { api, analytics } = useServices();

  useEffect(() => {
    // The page view is the visit's first request: it sets the visitor cookie
    // (so later requests share one identity) and wakes the API if it's idle.
    analytics.pageView().finally(() => loadMovies(dispatch, api, year));
  }, [analytics, api, dispatch, year]);

  return (
    <div className="app">
      <Sidebar />

      {/* Right column */}
      <div className="content">
        {/* Full-width sticky calendar */}
        <div className="sticky-cal">
          <Calendar />
        </div>

        {/* Constrained movie content */}
        <div className="content-inner">
          {movies.status === "loading" && <p className="status-message">Summoning this year's lineup…</p>}
          {movies.status === "failed" && (
            <p className="status-message" role="alert">
              We couldn't load the movies. Please refresh to try again.
            </p>
          )}
          {movies.items.map((movie) => (
            <section id={`movie-${movie.day}`} className="movie-section" key={movie.id}>
              <MovieCard movie={movie} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
