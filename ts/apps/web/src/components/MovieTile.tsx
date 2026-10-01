import type { Movie } from "../lib/api";
import { calendarDate, letterboxdLink, nightLabel, outOfFive } from "../lib/format";
import { useAppState, useDispatch, useServices } from "../state/AppState";
import { watchedToggled } from "../state/events";
import { isWatched, selectRating } from "../state/reducer";
import { CheckIcon, DropIcon, EyeIcon, PencilIcon } from "./icons";
import RatingDrops, { useRatingStatus } from "./RatingDrops";
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
  const rating = useRatingStatus(movie.id);

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
          <div className="tile-rating">
            <span className="tile-score">
              <DropIcon className="tile-score-drop" />
              {summary && summary.count > 0 ? (
                <>
                  <strong>{outOfFive(summary.average)}/5</strong>
                  <span className="tile-score-count">
                    ({summary.count} {summary.count === 1 ? "rating" : "ratings"})
                  </span>
                </>
              ) : (
                <span className="tile-score-count">Not rated yet</span>
              )}
            </span>

            {/* Rate right here; the review form is only needed to write a review. */}
            <span className="tile-mine">
              <span className="tile-mine-label">Your rating</span>
              <RatingDrops movieId={movie.id} onRate={rating.rated} small />
              <span role="status" className={`tile-mine-status${rating.isError ? " is-error" : ""}`}>
                {rating.status}
              </span>
            </span>
          </div>

          {/* Their own row, under the score. */}
          <div className="tile-buttons">
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
      </div>

      <div className="tile-backdrop" aria-hidden="true">
        <img src={movie.posterUrl} alt="" loading="lazy" />
      </div>
    </div>
  );
}
