import { useId } from "react";
import { calendarDate, nightLabel } from "../lib/format";
import { missingTapeLine, type Night } from "../lib/nights";
import "./MissingTape.css";

/** A night whose movie hasn't been picked yet: a dead signal where the card would be. */
export default function MissingTape({ night }: { night: Night }) {
  const headingId = useId();
  const { month, day } = calendarDate(night.date);

  return (
    <article className="missing-tape surface" aria-labelledby={headingId}>
      <div className="tile-date">
        <span aria-hidden="true">
          <span className="tile-month">{month}</span>
          <span className="tile-day">{day}</span>
        </span>
        <span className="sr-only">{nightLabel(night.date)}</span>
      </div>

      <div className="tape-screen">
        <h2 className="tape-title" id={headingId}>
          No signal
        </h2>
        <p className="tape-line">{missingTapeLine(night.day)}</p>
      </div>
    </article>
  );
}
