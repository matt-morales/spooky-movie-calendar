import type { Movie } from "../lib/api";
import { calendarDate, letterboxdLink, nightLabel, outOfTen } from "../lib/format";
import { useAppState, useDispatch, useServices } from "../state/AppState";
import { watchedToggled } from "../state/events";
import { isWatched, selectRating } from "../state/reducer";
import { CheckIcon, DropIcon, EyeIcon, PencilIcon } from "./icons";
import "./MovieTile.css";

interface Props {
  movie: Movie;
  headingId?: string;
  /** Makes the title a button that opens the reviews. Omitted once they're open. */
  onOpen?(): void;
  onAddReview(): void;
}

/** A movie's date, poster, details and actions: the front of the card, and the top of its reviews view. */
export default function MovieTile({ movie, headingId, onOpen, onAddReview }: Props) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { analytics } = useServices();
  const { summary } = selectRating(state, movie.id);
  const watched = isWatched(state, movie.id);
  const { month, day } = calendarDate(movie.date);
  const meta = [movie.directors.join(", "), movie.releaseYear].filter(Boolean);

  const toggleWatched = () => {
    dispatch(watchedToggled(movie.id));
    analytics.track("watched_toggled", { movieId: movie.id, watched: !watched });
  };

  return (
    <div className="tile">
      <div className="tile-date">
        <span aria-hidden="true">
          <span className="tile-month">{month}</span>
          <span className="tile-day">{day}</span>
        </span>
        <span className="sr-only">{nightLabel(movie.date)}</span>
      </div>

      <img src={movie.posterUrl} alt={`${movie.title} poster`} className="tile-poster" loading="lazy" />

      <div className="tile-info">
        <div className="tile-head">
          <h2 className="tile-title" id={headingId}>
            {onOpen ? (
              <button type="button" className="tile-title-btn" aria-haspopup="dialog" onClick={onOpen}>
                {movie.title}
              </button>
            ) : (
              movie.title
            )}
          </h2>
          {meta.length > 0 && (
            <p className="tile-meta">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </p>
          )}
        </div>
        <p className="tile-desc">{movie.description}</p>

        <div className="tile-actions">
          <span className="tile-score">
            <DropIcon className="tile-score-drop" />
            {summary && summary.count > 0 ? (
              <>
                <strong>{outOfTen(summary.average)}/10</strong>
                <span className="tile-score-count">
                  ({summary.count} {summary.count === 1 ? "rating" : "ratings"})
                </span>
              </>
            ) : (
              <span className="tile-score-count">Not rated yet</span>
            )}
          </span>

          <a className="btn" href={letterboxdLink(movie)} target="_blank" rel="noopener noreferrer">
            <img src="/icons/letterboxd.png" alt="" />
            View on Letterboxd
          </a>
          <button type="button" className="btn" aria-pressed={watched} onClick={toggleWatched}>
            {watched ? <CheckIcon /> : <EyeIcon />}
            {watched ? "Watched" : "Mark as watched"}
          </button>
          <button type="button" className="btn btn-primary" aria-haspopup="dialog" onClick={onAddReview}>
            <PencilIcon />
            Add your review
          </button>
        </div>
      </div>

      <div className="tile-backdrop" aria-hidden="true">
        <img src={movie.posterUrl} alt="" loading="lazy" />
      </div>
    </div>
  );
}
