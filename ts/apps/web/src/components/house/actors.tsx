// Reusable characters for house stories.
import { INK, groundY, lerp, progress } from "./scene";

export type Pose = "run" | "walk" | "stand" | "look" | "lookUp" | "carried";

export interface FigureFrame {
  x: number; // feet, horizontally
  // Feet, on the ground. For "carried" it's the middle of the body instead,
  // since that's what's being lifted.
  y: number;
  facing: 1 | -1; // 1 = right
  pose: Pose;
  stride: number; // -1..1 swing of legs and arms (dangle, when carried); 0 when still
  tilt?: number; // "carried" only: 0 = upright, 1 = lying horizontal
}

const RUN_STRIDES_PER_SECOND = 3.2;
const WALK_STRIDES_PER_SECOND = 1.7;

function across(pose: Pose, rate: number, t: number, from: number, to: number, x0: number, x1: number): FigureFrame {
  const x = lerp(x0, x1, progress(t, from, to));
  return {
    x,
    y: groundY(x),
    facing: x1 >= x0 ? 1 : -1,
    pose,
    stride: Math.sin((t - from) * rate * 2 * Math.PI),
  };
}

/** A figure running along the hill from x0 to x1 between the times from..to. */
export const runAcross = (t: number, from: number, to: number, x0: number, x1: number) =>
  across("run", RUN_STRIDES_PER_SECOND, t, from, to, x0, x1);

/** A figure walking along the hill from x0 to x1 between the times from..to. */
export const walkAcross = (t: number, from: number, to: number, x0: number, x1: number) =>
  across("walk", WALK_STRIDES_PER_SECOND, t, from, to, x0, x1);

/** A figure standing still on the ground at x. */
export function standAt(x: number, pose: Pose, facing: 1 | -1): FigureFrame {
  return { x, y: groundY(x), facing, pose, stride: 0 };
}

/** Height of a standing figure's middle above its feet (where "carried" lifts it). */
export const MIDDLE = 9;

type Pt = { x: number; y: number };
// Rounded to hundredths: plenty for the screen, and avoids "1e-16"-style noise.
const r2 = (n: number) => Math.round(n * 100) / 100;
const line = (a: Pt, b: Pt) => `M${r2(a.x)} ${r2(a.y)}L${r2(b.x)} ${r2(b.y)}`;
const limb = (from: Pt, degrees: number, length: number): Pt => {
  const r = (degrees * Math.PI) / 180;
  return { x: from.x + Math.sin(r) * length, y: from.y + Math.cos(r) * length };
};

// A stick figure about 17 units tall, drawn with its feet at the origin,
// facing right. Legs and arms swing opposite each other with the stride.
export function StickFigure({ figure }: { figure: FigureFrame }) {
  const { x, y, facing, pose, stride } = figure;
  const mirror = facing === -1 ? " scale(-1 1)" : "";
  const style = {
    stroke: INK,
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;

  if (pose === "carried") {
    // Lifted by the middle: the body turns toward horizontal while the arms
    // and legs hang straight down, swaying with the stride.
    const angle = ((figure.tilt ?? 0) * Math.PI) / 2;
    const dir = { x: Math.sin(angle), y: -Math.cos(angle) }; // from hips toward head
    const shoulder = { x: dir.x * 2.5, y: dir.y * 2.5 };
    const hip = { x: -dir.x * 2.5, y: -dir.y * 2.5 };
    const sway = stride * 10;
    return (
      <g data-part="figure" data-pose={pose} transform={`translate(${x} ${y})${mirror}`} {...style}>
        <path d={line(hip, shoulder)} />
        <path d={line(hip, limb(hip, sway + 6, 6.5)) + line(hip, limb(hip, sway - 6, 6.5))} />
        <path d={line(shoulder, limb(shoulder, sway + 8, 5)) + line(shoulder, limb(shoulder, sway - 8, 5))} />
        <circle cx={dir.x * 5.2} cy={dir.y * 5.2} r="2.3" fill={INK} stroke="none" />
      </g>
    );
  }

  const running = pose === "run";
  const walking = pose === "walk";
  const bounce = running ? -Math.abs(stride) * 0.7 : walking ? -Math.abs(stride) * 0.3 : 0;
  const lean = running ? 1.4 : 0;

  const hip = { x: 0, y: -6.5 };
  const shoulder = { x: lean, y: -11.5 };
  const legSwing = running ? stride * 38 : walking ? stride * 24 : 12;
  const armSwing = running ? stride * 45 : walking ? stride * 22 : 14;
  const arms =
    pose === "look"
      ? // One hand shading the eyes, the other at the side.
        `M${shoulder.x} ${shoulder.y}L2.4 -12.2L1.2 -14.6${line(shoulder, limb(shoulder, -14, 5))}`
      : line(shoulder, limb(shoulder, -armSwing, 5)) + line(shoulder, limb(shoulder, armSwing, 5));
  const head =
    pose === "look" ? { x: 0.6, y: -14.3 } : pose === "lookUp" ? { x: -0.6, y: -14.8 } : { x: lean, y: -14.3 };

  return (
    <g data-part="figure" data-pose={pose} transform={`translate(${x} ${y + bounce})${mirror}`} {...style}>
      <path d={line(shoulder, hip)} />
      <path d={line(hip, limb(hip, legSwing, 6.5)) + line(hip, limb(hip, -legSwing, 6.5))} />
      <path d={arms} />
      <circle cx={head.x} cy={head.y} r="2.3" fill={INK} stroke="none" />
    </g>
  );
}
