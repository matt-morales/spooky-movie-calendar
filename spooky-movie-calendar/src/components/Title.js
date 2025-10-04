import React, { useState, useEffect } from "react";
import "./Title.css";

export default function Title() {
  return (
    <h1 className="title">
      <span className="title-number">3</span>
      <span className="title-tilt">1</span> <br />
      NIGHTS OF <br />
      HALL
      <EyeO />
      WEEN <br />
      MOVIE<span className="title-fall">S</span>
    </h1>
  );
}

function EyeO() {
  const states = [
    // Centered
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        fill="white"
        stroke="white"
        strokeWidth="2"
      />
    </svg>,

    // Right
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 15C15.6569 15 17 13.6569 17 12C17 10.3431 15.6569 9 14 9C12.3431 9 11 10.3431 11 12C11 13.6569 12.3431 15 14 15Z"
        fill="white"
        stroke="white"
        strokeWidth="2"
      />
    </svg>,

    // Left
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 15C10.6569 15 12 13.6569 12 12C12 10.3431 10.6569 9 9 9C7.34315 9 6 10.3431 6 12C6 13.6569 7.34315 15 9 15Z"
        fill="white"
        stroke="white"
        strokeWidth="2"
      />
    </svg>,

    // Closed
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M1 11C1 11 5 9 12 9C19 9 23 11 23 11C23 11 19 13 12 13C5 13 1 11 1 11Z"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>,
  ];

  // Per-state durations (ms)
  const durations = [2000, 500, 700, 200];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Respect reduced motion: keep centered if user prefers no animation
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;

    const t = setTimeout(() => {
      setIndex((p) => (p + 1) % states.length);
    }, durations[index]);

    return () => clearTimeout(t);
  }, [index]); // re-run for each state

  return (
    <span className="title-o">
      <svg
        className="title-o-ring"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <ellipse
          cx="50"
          cy="50"
          rx="48"
          ry="50"
          fill="black"
          stroke="#e4453c"
          strokeWidth="8"
        />
      </svg>
      <span className="o-core">{states[index]}</span>
    </span>
  );
}
