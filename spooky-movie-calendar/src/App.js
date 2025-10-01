import Sidebar from "./components/Sidebar";
import Calendar from "./components/Calendar";
import MovieCard from "./components/MovieCard";
import movies from "./data/movies";
import "./App.css";

function App() {
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
            const day = movie.day ?? i + 1; // ensure 1..31 if not provided
            return (
              <section
                id={`movie-${day}`}
                className="movie-section"
                key={movie.id}
              >
                <MovieCard movie={movie} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
