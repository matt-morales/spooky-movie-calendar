import { useCommentThread } from "@spooky/comment";
import { useCallback, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Movie } from "../lib/api";
import { useServices } from "../state/AppState";
import MovieDetail from "./MovieDetail";
import MovieTile from "./MovieTile";
import ReviewModal from "./ReviewModal";
import "./MovieCard.css";

export default function MovieCard({ movie }: { movie: Movie }) {
  const { comments, analytics } = useServices();
  const cardRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const [origin, setOrigin] = useState<DOMRect | null>(null); // set while the reviews are open
  const [reviewing, setReviewing] = useState(false);

  // Reviews are a flat comment thread, loaded once a visitor opens them so the
  // page doesn't fetch 31 threads up front. A review posted from the modal is
  // added straight away either way, and the card's count follows along.
  const [reviewCount, setReviewCount] = useState(movie.reviewCount);
  const counted = useCallback(() => setReviewCount((n) => n + 1), []);
  const thread = useCommentThread(`movie:${movie.id}`, {
    client: comments,
    enabled: origin !== null,
    onPosted: counted,
  });
  const reviews = useMemo(
    () => ({
      ...thread,
      remove: async (id: number) => {
        await thread.remove(id);
        setReviewCount((n) => Math.max(0, n - 1));
      },
    }),
    [thread],
  );
  const shown = useMemo(() => ({ ...movie, reviewCount }), [movie, reviewCount]);

  const openReviews = () => {
    if (origin || !cardRef.current) return;
    setOrigin(cardRef.current.getBoundingClientRect());
    analytics.track("reviews_opened", { movieId: movie.id });
  };

  // Clicking anywhere on the card opens it, except on its own links and buttons
  // (or inside the modals, whose clicks bubble here through their portals).
  const handleCardClick = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as Element;
    if (!e.currentTarget.contains(target) || target.closest("a, button")) return;
    openReviews();
  };

  const handleClosed = () => {
    setOrigin(null);
    cardRef.current?.querySelector<HTMLElement>(".tile-title-btn")?.focus({ preventScroll: true });
  };

  return (
    <>
      <article
        ref={cardRef}
        className={`movie-card surface${origin ? " is-lifted" : ""}`}
        aria-labelledby={headingId}
        onClick={handleCardClick}
      >
        <MovieTile movie={shown} headingId={headingId} onOpen={openReviews} onAddReview={() => setReviewing(true)} />
      </article>

      {origin && (
        <MovieDetail
          movie={shown}
          origin={origin}
          reviews={reviews}
          onAddReview={() => setReviewing(true)}
          onClosed={handleClosed}
        />
      )}

      {reviewing && <ReviewModal movie={movie} onPost={reviews.post} onClose={() => setReviewing(false)} />}
    </>
  );
}
