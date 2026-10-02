import { CommentList, type useCommentThread } from "@spooky/comment";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Movie } from "../lib/api";
import { prefersReducedMotion, useDialogFocus, useScrollLock } from "../lib/dialog";
import { CloseIcon } from "./icons";
import MovieTile from "./MovieTile";
import "./MovieDetail.css";

// Opening: the card turns over top-down in place, then stretches vertically
// to reveal its reviews. Closing plays the same steps in reverse. These
// match --speed-flip and --speed-expand in tokens.css.
const FLIP_MS = 550;
const EXPAND_MS = 450;

type Phase = "start" | "flipping" | "expanding" | "open" | "collapsing" | "unflipping";

const NEXT: Partial<Record<Phase, [Phase | "closed", number]>> = {
  flipping: ["expanding", FLIP_MS],
  expanding: ["open", EXPAND_MS],
  collapsing: ["unflipping", EXPAND_MS],
  unflipping: ["closed", FLIP_MS],
};

interface Props {
  movie: Movie;
  /** Where the card is on screen; the flip starts (and ends) exactly there. */
  origin: DOMRect;
  reviews: ReturnType<typeof useCommentThread>;
  onAddReview(): void;
  onClosed(): void;
}

export default function MovieDetail({ movie, origin, reviews, onAddReview, onClosed }: Props) {
  const reduceMotion = useMemo(prefersReducedMotion, []);
  const [phase, setPhase] = useState<Phase>(reduceMotion ? "open" : "start");
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const reviewsHeadingId = useId();
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  useScrollLock();

  useEffect(() => {
    if (phase === "start") {
      // Let the browser paint the unflipped card before turning it.
      let inner = 0;
      const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setPhase("flipping"))));
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const next = NEXT[phase];
    if (!next) return;
    const [to, ms] = next;
    const t = setTimeout(() => (to === "closed" ? onClosedRef.current() : setPhase(to)), ms);
    return () => clearTimeout(t);
  }, [phase]);

  const close = () => {
    if (reduceMotion) return onClosed();
    setPhase((p) => (p === "start" || p === "flipping" ? "unflipping" : p === "unflipping" ? p : "collapsing"));
  };

  const onKeyDown = useDialogFocus(dialogRef, close, { active: phase === "open", restoreFocus: false });

  // Stretch to most of the viewport's height, keeping the card's width.
  const target = useMemo(() => {
    const gutter = 16;
    const height = Math.min(window.innerHeight - 2 * gutter, Math.max(origin.height, window.innerHeight * 0.86));
    return { top: (window.innerHeight - height) / 2, height };
  }, [origin]);

  const expanded = phase === "expanding" || phase === "open";
  const box: CSSProperties = {
    left: origin.left,
    width: origin.width,
    top: expanded ? target.top : origin.top,
    height: expanded ? target.height : origin.height,
  };

  return createPortal(
    <div className="detail-layer" data-phase={phase}>
      <div className="detail-scrim" onClick={close} />
      <div className="flip-card" style={box}>
        <div className="flip-inner">
          {/* Front: the card as it looked on the page. */}
          <div className="flip-face flip-front surface" aria-hidden="true" inert>
            <MovieTile movie={movie} onAddReview={() => {}} />
          </div>

          {/* Back: the same card, with its reviews underneath. */}
          <div
            ref={dialogRef}
            className="flip-face flip-back surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
          >
            <button type="button" className="icon-btn detail-close" aria-label="Close reviews" onClick={close} data-autofocus>
              <CloseIcon />
            </button>

            <div className="flip-scroll">
              <MovieTile movie={movie} headingId={headingId} onAddReview={onAddReview} />

              <section className="detail-reviews" aria-labelledby={reviewsHeadingId}>
                <h3 id={reviewsHeadingId} className="detail-reviews-title">
                  Reviews
                </h3>
                <CommentList
                  comments={reviews.comments}
                  status={reviews.status}
                  hasOlder={reviews.hasOlder}
                  maxDepth={1}
                  onDelete={reviews.remove}
                  onReact={reviews.react}
                  onLoadOlder={reviews.loadOlder}
                  noun="reviews"
                  emptyText="No reviews yet. Be the first to add one."
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
