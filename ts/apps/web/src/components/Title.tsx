import { useEffect, useId, useState } from "react";
import { prefersReducedMotion } from "../lib/dialog";
import "./Title.css";

export default function Title() {
  return (
    <h1 className="title">
      <span className="title-number">3</span>
      <span className="title-tilt">1</span> NIGHTS OF <br />
      HALL
      <EyeO />
      WEEN <br />
      MOVIE<span className="title-fall">S</span>
    </h1>
  );
}

// The eye looks around, then blinks: [state, how long to hold it (ms)].
const LOOKS = [
  ["look-center", 2000],
  ["look-right", 500],
  ["look-left", 700],
  ["blink", 200],
] as const;

// The "O" in HALLOWEEN: a red eye whose pupil wanders and blinks.
function EyeO() {
  const [index, setIndex] = useState(0);
  const id = useId();
  const lens = "M2 42C18-6 82-6 98 42 82 90 18 90 2 42Z";

  useEffect(() => {
    // Respect reduced motion: keep the eye still, looking straight ahead.
    if (prefersReducedMotion()) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % LOOKS.length), LOOKS[index]![1]);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <span className="title-o" aria-hidden="true">
      <svg className={`eye ${LOOKS[index]![0]}`} viewBox="0 5 100 74">
        <defs>
          <radialGradient id={`${id}-flesh`} cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#ff6a5c" />
            <stop offset="0.55" style={{ stopColor: "var(--accent)" }} />
            <stop offset="1" stopColor="#7d1420" />
          </radialGradient>
          <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5e0d17" />
            <stop offset="1" stopColor="#c7352d" />
          </linearGradient>
          <radialGradient id={`${id}-shade`} cx="50%" cy="55%" r="55%">
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <clipPath id={`${id}-clip`}>
            <path d={lens} />
          </clipPath>
        </defs>

        <path d={lens} fill={`url(#${id}-flesh)`} />
        <g clipPath={`url(#${id}-clip)`}>
          <g className="eye-iris">
            <circle cx="50" cy="42" r="25" fill="#170506" />
            <circle cx="50" cy="42" r="18" style={{ fill: "var(--color-bone)" }} />
            <circle cx="50" cy="42" r="9.5" fill="#050505" />
            <circle cx="46" cy="38" r="3" fill="#fff" />
          </g>
          <rect width="100" height="84" fill={`url(#${id}-shade)`} />
          <g className="eye-lid eye-lid-top">
            <rect x="0" y="-2" width="100" height="44" fill={`url(#${id}-lid)`} />
            <path d="M0 42H100" stroke="#3a060c" strokeWidth="3" />
          </g>
          <g className="eye-lid eye-lid-bottom">
            <rect x="0" y="42" width="100" height="44" fill="#9e2229" />
          </g>
        </g>
        <path d={lens} fill="none" stroke="#3a060c" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
