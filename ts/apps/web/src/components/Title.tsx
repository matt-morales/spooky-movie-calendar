import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "../lib/dialog";
import { REST, lidEdges, lookToward, nextBeat, startle, type Beat, type EyeStep, type Mood } from "./eye";
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

// The almond of the eye.
const LENS = "M4 38C20 -8 80 -8 96 38 80 84 20 84 4 38Z";

// A few cartoon veins creeping in from the corners: it hasn't slept.
const VEINS = ["M6 38C12 37 15 40 21 38S27 36 30 37", "M7 35C11 32 15 33 18 30", "M94 38C88 39 85 36 79 38S73 40 70 39", "M93 42C89 44 85 43 82 46"];

// Fibres radiating from the pupil across the iris.
const FIBRES = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  const p = (r: number) => `${(50 + Math.cos(a) * r).toFixed(2)} ${(38 + Math.sin(a) * r).toFixed(2)}`;
  return `M${p(10.5)}L${p(18.5)}`;
}).join("");

// How long the eye stays on edge after the last mouse move or touch.
const CALM_AFTER = 4000;
// A mouse move after this long a pause counts as a new movement, and startles it again.
const PAUSE = 400;
// How quickly a startled eye's gaze follows the pointer.
const SACCADE_MS = 60;

// The "O" in HALLOWEEN: a bloodshot, heavy-lidded eye that hasn't slept in days.
// Left alone it keeps nodding off; move the mouse or touch the screen and it
// jolts awake and looks around, paranoid (see ./eye).
function EyeO() {
  const [step, setStep] = useState<EyeStep>(REST);
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const lid = useTween(step.lid, step.ms);
  const edges = lidEdges(lid);

  useEffect(() => {
    // Respect reduced motion: keep the eye still, staring straight ahead.
    if (prefersReducedMotion()) return;
    let mood: Mood = "drowsy";
    let lastStir = 0;
    let beat: Beat | undefined;
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    let current = REST;

    const next = () => {
      if (!beat || i >= beat.steps.length) {
        if (mood === "alert" && performance.now() - lastStir > CALM_AFTER) mood = "drowsy";
        beat = nextBeat(Math.random, beat, mood);
        i = 0;
      }
      const s = beat.steps[i++]!;
      current = s;
      setStep(s);
      t = setTimeout(next, s.ms + s.hold);
    };

    // Each new mouse movement (after a pause) or touch startles the eye
    // straight away. While it's startled it stares at the pointer, following it.
    const stir = (e: PointerEvent) => {
      const now = performance.now();
      const fresh = e.type !== "pointermove" || now - lastStir > PAUSE;
      lastStir = now;
      const box = svg.current?.getBoundingClientRect();
      if (!box) return;
      const look = lookToward(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2));
      if (!fresh) {
        if (beat?.name === "startle") {
          beat.steps = beat.steps.map((s) => ({ ...s, ...look }));
          current = { ...current, ...look, ms: SACCADE_MS };
          setStep(current);
        }
        return;
      }
      mood = "alert";
      clearTimeout(t);
      beat = startle(Math.random, current, look);
      i = 0;
      next();
    };
    // Pointer events cover the mouse, pens and touch screens.
    const events = ["pointermove", "pointerdown"] as const;
    events.forEach((e) => window.addEventListener(e, stir, { passive: true }));

    t = setTimeout(next, 1500);
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, stir));
    };
  }, []);

  const vars = { "--gx": step.x, "--gy": step.y, "--pupil": step.pupil, "--ms": `${step.ms}ms` } as CSSProperties;

  return (
    <span className="title-o" aria-hidden="true">
      <svg ref={svg} className="eye" viewBox="0 1 100 74" style={vars}>
        <defs>
          <clipPath id={`${id}-clip`}>
            <path d={LENS} />
          </clipPath>
        </defs>

        <path d={LENS} style={{ fill: "var(--color-bone)" }} />
        <g clipPath={`url(#${id}-clip)`}>
          <g fill="none" stroke="#d8323a" strokeWidth="1.2" strokeLinecap="round">
            {VEINS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g className="eye-iris">
            <circle cx="50" cy="38" r="21" fill="#8f897f" stroke="#1a1010" strokeWidth="3" />
            <path d={FIBRES} stroke="#5c564e" strokeWidth="1" strokeLinecap="round" />
            <circle className="eye-pupil" cx="50" cy="38" r="8.5" fill="#0a0606" />
            <circle cx="43.5" cy="31.5" r="3.4" fill="#fff" />
          </g>
          {/* Lids hinge at the corners; the top lid's lash line is drawn last so a shut eye shows it. */}
          <path d={`${edges.top}V-10H4Z`} fill="#8e1b22" />
          <path d={`${edges.bottom}V90H4Z`} fill="#a8262c" />
          <path d={edges.bottom} fill="none" stroke="#ff7466" strokeWidth="2.5" />
          <path d={edges.top} fill="none" stroke="#1a0306" strokeWidth="4" />
        </g>
        <path d={LENS} fill="none" stroke="#1a0306" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Eases a number toward `target` over `ms`, one animation frame at a time. */
function useTween(target: number, ms: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return value;
}
