import Sidebar from "./components/Sidebar";
import Calendar from "./components/Calendar";
import MovieCard from "./components/MovieCard";
import movies from "./data/movies";
import "./App.css";
import { useEffect, useState } from "react";
import { ensureAnonAuth } from "./lib/firebase";

function App() {
  const [uid, setUid] = useState(null);
  useEffect(() => {
    ensureAnonAuth().then((user) => {
      setUid(user.uid);
    });
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
            const day = i + 1;
            const movieId = String(movie.id ?? day);
            return (
              <section
                id={`movie-${day}`}
                className="movie-section"
                key={movieId}
              >
                <MovieCard uid={uid} movie={movie} movieId={movieId} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
