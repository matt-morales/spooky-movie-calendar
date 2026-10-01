import { CommentForm, useTurnstile, type PostArgs } from "@spooky/comment";
import { useId, useState } from "react";
import type { Movie } from "../lib/api";
import { nightLabel } from "../lib/format";
import { useAppState } from "../state/AppState";
import { selectRating } from "../state/reducer";
import { CloseIcon } from "./icons";
import Modal from "./Modal";
import RatingDrops from "./RatingDrops";
import "./ReviewModal.css";

interface Props {
  movie: Movie;
  onPost(args: PostArgs): Promise<unknown>;
  onClose(): void;
}

/** Rate a movie and write a review. Reviews are flat comments on the movie's thread. */
export default function ReviewModal({ movie, onPost, onClose }: Props) {
  const headingId = useId();
  // Mounted only while the modal is open, so the page doesn't load a
  // Turnstile widget per movie up front.
  const turnstile = useTurnstile(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  // A rating saves as soon as a drop is picked, with or without a review, so
  // say so once the visitor rates here.
  const [rated, setRated] = useState(false);
  const { mine, saving, error } = selectRating(useAppState(), movie.id);
  const status = !rated
    ? ""
    : saving
      ? "Saving…"
      : error
        ? "Couldn't save your rating. Try again."
        : mine
          ? "Rating saved"
          : "";

  const submit = async (body: string, authorName: string) => {
    const turnstileToken = await turnstile.getToken();
    await onPost({ body, authorName, turnstileToken });
    onClose();
  };

  return (
    <Modal labelledBy={headingId} onClose={onClose} className="review-modal">
      <button type="button" className="icon-btn review-close" aria-label="Close" onClick={onClose}>
        <CloseIcon />
      </button>

      <header className="review-head">
        <img src={movie.posterUrl} alt="" className="review-poster" />
        <div>
          <p className="review-kicker">{nightLabel(movie.date)}</p>
          <h2 id={headingId} className="review-title">
            Review {movie.title}
          </h2>
          {movie.directors.length > 0 && <p className="review-meta">{movie.directors.join(", ")}</p>}
        </div>
      </header>

      <div className="review-rating">
        <span className="review-label">Your rating</span>
        <p role="status" className={`review-rating-status${error ? " is-error" : ""}`}>
          {status}
        </p>
        <RatingDrops movieId={movie.id} onRate={() => setRated(true)} />
      </div>

      <CommentForm label="Your review" submitLabel="Post review" showName onSubmit={submit} onCancel={onClose} />
      <div ref={turnstile.ref} />
    </Modal>
  );
}
