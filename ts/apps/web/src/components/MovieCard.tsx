import { useState } from "react";
import type { Movie } from "../lib/api";
import { averageDrops, nightLabel } from "../lib/format";
import { useAppState, useDispatch, useServices } from "../state/AppState";
import { rateMovie } from "../state/effects";
import { selectRating } from "../state/reducer";
import MovieComments from "./MovieComments";
import "./MovieCard.css";

export default function MovieCard({ movie }: { movie: Movie }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { api } = useServices();
  const { mine: myRating, summary } = selectRating(state, movie.id);
  const [showComments, setShowComments] = useState(false);

  const handleRate = (value: number) => {
    rateMovie(dispatch, api, { movieId: movie.id, value, previous: myRating });
  };

  return (
    <article className="movie-card">
      <header className="movie-head">
        <h2 className="movie-title">{movie.title}</h2>
        {movie.directors.length > 0 && <div className="movie-meta">Directed by {movie.directors.join(", ")}</div>}
      </header>

      <div className="movie-body">
        <figure className="poster-wrap">
          <div className="poster-plate">
            <img src={movie.posterUrl} alt={movie.title} className="poster-img" loading="lazy" />
          </div>
        </figure>

        <div className="date-badge">{nightLabel(movie.date)}</div>

        <div className="movie-copy">
          <p className="description">{movie.description}</p>

          <div className="rating">
            <div>
              <span>Your rating:&nbsp;</span>
              {[1, 2, 3, 4, 5].map((n) => {
                const isActive = (myRating ?? 0) >= n * 2;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleRate(n * 2)}
                    aria-label={`Rate ${n} ${n === 1 ? "drop" : "drops"}`}
                    aria-pressed={isActive}
                    className={`rating-drop ${isActive ? "active" : ""}`}
                  >
                    <svg viewBox="0 0 9 14" className="blood-drop" aria-hidden="true">
                      <path d="M4.49781 1L6.97406 4.51576C7.46377 5.2106 7.79735 6.09603 7.93258 7.06007C8.06781 8.0241 7.99864 9.02342 7.7338 9.93163C7.46896 10.8398 7.02036 11.6161 6.44473 12.1623C5.86911 12.7085 5.19233 13 4.5 13C3.80767 13 3.13089 12.7085 2.55527 12.1623C1.97965 11.6161 1.53104 10.8398 1.2662 9.93163C1.00136 9.02342 0.932187 8.0241 1.06742 7.06007C1.20266 6.09603 1.53623 5.2106 2.02594 4.51576L4.49781 1Z" />
                    </svg>
                  </button>
                );
              })}
            </div>

            {summary && summary.count > 0 && (
              <div className="rating-summary">
                Average rating: {averageDrops(summary.average)} ({summary.count})
              </div>
            )}
          </div>

          <button
            type="button"
            className="comments-toggle"
            aria-expanded={showComments}
            onClick={() => setShowComments((s) => !s)}
          >
            {showComments ? "Hide comments" : "Comments"}
          </button>
        </div>
      </div>

      {showComments && <MovieComments movieId={movie.id} />}
    </article>
  );
}
