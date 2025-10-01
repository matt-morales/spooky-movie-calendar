import "./MovieCard.css";

export default function MovieCard({ movie }) {
  // Optional: flip date badge on even days to mimic alternating layout
  const rightBadge = movie.day % 2 === 0;

  return (
    <section id={`movie-${movie.day}`} className="movie-section">
      <article
        className={`movie-card${rightBadge ? " is-right-badge" : ""}`}
        aria-labelledby={`title-${movie.id}`}
      >
        <header className="movie-head">
          <h2 id={`title-${movie.id}`} className="movie-title">
            {movie.title}
          </h2>
          <div className="movie-meta">
            <span className="directors">Directed by {movie.directors}</span>
          </div>
        </header>

        <div className="movie-body">
          <figure className="poster-wrap">
            <div className="poster-plate">
              {movie.poster && (
                <img
                  className="poster-img"
                  src={movie.poster} // e.g. "/posters/the-grudge.jpg"
                  alt={movie.title}
                  loading="lazy"
                />
              )}
            </div>
          </figure>

          <div className="date-badge">{movie.date}</div>
          <div className="movie-copy">
            <p className="description">{movie.description}</p>
            <p className="rating">
              <span className="label">Overall rating:</span>{" "}
              <strong>{movie.rating}/10</strong>
            </p>
          </div>
        </div>

        <footer className="movie-foot"></footer>
      </article>
    </section>
  );
}
