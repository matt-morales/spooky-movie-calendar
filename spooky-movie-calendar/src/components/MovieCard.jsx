// components/MovieCard.jsx
import { useEffect, useState } from "react";
import { getMyRating, setRating, getRatingSummary } from "../services/ratings";
import "./MovieCard.css";

export default function MovieCard({ uid, movie, movieId }) {
  const [myRating, setMyRating] = useState(null);
  const [summary, setSummary] = useState(null); // { average, count }

  // load data once we have uid + movieId
  useEffect(() => {
    if (!uid || !movieId) return;

    getMyRating(movieId, uid).then(setMyRating);
    getRatingSummary(movieId).then(setSummary);
  }, [uid, movieId]);

  const handleRate = async (val) => {
    if (!uid || !movieId) return;
    await setRating(movieId, uid, val);
    setMyRating(val);
    setSummary(await getRatingSummary(movieId));
  };

  return (
    <article className="movie-card">
      <header className="movie-head">
        <h2 className="movie-title">{movie.title}</h2>
        {movie.directors && (
          <div className="movie-meta">Directed by {movie.directors}</div>
        )}
      </header>

      <div className="movie-body">
        <figure className="poster-wrap" style={{ gridArea: "poster" }}>
          <div className="poster-plate">
            <img src={movie.poster} alt={movie.title} className="poster-img" />
          </div>
        </figure>

        <div className="date-badge" style={{ gridArea: "badge" }}>
          {movie.date}
        </div>

        <div className="movie-copy" style={{ gridArea: "desc" }}>
          <p className="description">{movie.description}</p>

          <div className="rating" style={{ marginTop: "var(--col-gap)" }}>
            <div>
              <span>Your rating:&nbsp;</span>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleRate(n)}
                  aria-label={`Rate ${n}`}
                  className={`rating-drop ${n <= (myRating ?? 0) ? "active" : ""}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 9 14"
                    className="blood-drop"
                  >
                    <path d="M4.49781 1L6.97406 4.51576C7.46377 5.2106 7.79735 6.09603 7.93258 7.06007C8.06781 8.0241 7.99864 9.02342 7.7338 9.93163C7.46896 10.8398 7.02036 11.6161 6.44473 12.1623C5.86911 12.7085 5.19233 13 4.5 13C3.80767 13 3.13089 12.7085 2.55527 12.1623C1.97965 11.6161 1.53104 10.8398 1.2662 9.93163C1.00136 9.02342 0.932187 8.0241 1.06742 7.06007C1.20266 6.09603 1.53623 5.2106 2.02594 4.51576L4.49781 1Z" />
                  </svg>
                </button>
              ))}
            </div>

            {summary && (
              <div style={{ opacity: 0.9, marginTop: 8 }}>
                Average rating: {summary.average.toFixed(1)} ({summary.count})
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
