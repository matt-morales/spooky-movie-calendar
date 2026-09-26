import { CommentThread, useTurnstile } from "@spooky/comment";
import { useServices } from "../state/AppState";

// Mounted only when a visitor opens a movie's comments, so the page doesn't
// load 31 threads (or 31 Turnstile widgets) up front.
export default function MovieComments({ movieId }: { movieId: string }) {
  const { comments } = useServices();
  const turnstile = useTurnstile(import.meta.env.VITE_TURNSTILE_SITE_KEY);

  return (
    <div className="movie-comments">
      <CommentThread
        threadKey={`movie:${movieId}`}
        client={comments}
        getVerificationToken={turnstile.getToken}
      />
      <div ref={turnstile.ref} />
    </div>
  );
}
