import { useState } from "react";
import { dropsLabel } from "../lib/format";
import { useAppState, useDispatch, useServices } from "../state/AppState";
import { rateMovie } from "../state/effects";
import { selectRating } from "../state/reducer";
import { DropIcon } from "./icons";
import "./RatingDrops.css";

const DROPS = [1, 2, 3, 4, 5];

/**
 * The visitor's own rating in blood drops, with halves: ½ to 5 drops, stored
 * as 1–10. Each drop has two buttons, its left half and its right half.
 * Hovering previews the rating before it's picked.
 */
export default function RatingDrops({ movieId, onRate }: { movieId: string; onRate?: () => void }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { api } = useServices();
  const { mine } = selectRating(state, movieId);
  const [hover, setHover] = useState<number | null>(null);

  const rate = (value: number) => {
    onRate?.();
    return rateMovie(dispatch, api, { movieId, value, previous: mine });
  };
  const shown = hover ?? mine ?? 0;

  return (
    <div className="drops" role="group" aria-label="Your rating" onMouseLeave={() => setHover(null)}>
      {DROPS.map((n) => {
        const fill = shown >= n * 2 ? "full" : shown === n * 2 - 1 ? "half" : "empty";
        return (
          <span key={n} className={`drop is-${fill}`}>
            <DropIcon className="blood-drop" />
            <DropIcon className="blood-drop blood-drop-fill" />
            {[n * 2 - 1, n * 2].map((value) => (
              <button
                key={value}
                type="button"
                className={`drop-half drop-half-${value % 2 ? "left" : "right"}`}
                aria-label={`Rate ${dropsLabel(value)}`}
                aria-pressed={mine === value}
                onClick={() => rate(value)}
                onMouseEnter={() => setHover(value)}
                onFocus={() => setHover(value)}
                onBlur={() => setHover(null)}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}
