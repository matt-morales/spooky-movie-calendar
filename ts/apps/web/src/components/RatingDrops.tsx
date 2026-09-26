import { useAppState, useDispatch, useServices } from "../state/AppState";
import { rateMovie } from "../state/effects";
import { selectRating } from "../state/reducer";
import { DropIcon } from "./icons";
import "./RatingDrops.css";

/** The visitor's own 1–5 blood-drop rating (stored as 2–10). */
export default function RatingDrops({ movieId }: { movieId: string }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { api } = useServices();
  const { mine } = selectRating(state, movieId);

  const rate = (value: number) => rateMovie(dispatch, api, { movieId, value, previous: mine });

  return (
    <div className="drops" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const isActive = (mine ?? 0) >= n * 2;
        return (
          <button
            key={n}
            type="button"
            onClick={() => rate(n * 2)}
            aria-label={`Rate ${n} ${n === 1 ? "drop" : "drops"}`}
            aria-pressed={isActive}
            className={`drop-btn${isActive ? " active" : ""}`}
          >
            <DropIcon className="blood-drop" />
          </button>
        );
      })}
    </div>
  );
}
