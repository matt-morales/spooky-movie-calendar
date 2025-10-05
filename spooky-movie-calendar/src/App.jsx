import Sidebar from "./components/Sidebar";
import Calendar from "./components/Calendar";
import MovieCard from "./components/MovieCard";
import movies from "./data/movies";
import "./App.css";
import { useEffect } from "react";
import { ensureAnonAuth } from "./lib/firebase";

function App() {
  useEffect(() => {
    ensureAnonAuth();
  }, []);
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
          {movies.map((movie, i) => {
            const movieId = movie.id ?? i + 1; // ensure 1..31 if not provided
            return (
              <section
                id={`movie-${movieId}`}
                className="movie-section"
                key={movie.id}
              >
                <MovieCard movie={movie} movieId={movieId} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
