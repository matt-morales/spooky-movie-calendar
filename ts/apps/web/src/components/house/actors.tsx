// Reusable characters for house stories.
import { INK, groundY, lerp, progress } from "./scene";

export type Pose = "run" | "stand" | "look";

export interface FigureFrame {
  x: number; // feet, horizontally
  y: number; // feet, on the ground
  facing: 1 | -1; // 1 = right
  pose: Pose;
  stride: number; // -1..1 swing of legs and arms; 0 when still
}

const STRIDES_PER_SECOND = 3.2;

/** A figure running along the hill from x0 to x1 between the times from..to. */
export function runAcross(t: number, from: number, to: number, x0: number, x1: number): FigureFrame {
  const x = lerp(x0, x1, progress(t, from, to));
  return {
    x,
    y: groundY(x),
    facing: x1 >= x0 ? 1 : -1,
    pose: "run",
    stride: Math.sin((t - from) * STRIDES_PER_SECOND * 2 * Math.PI),
  };
}

/** A figure standing still on the ground at x. */
export function standAt(x: number, pose: Pose, facing: 1 | -1): FigureFrame {
  return { x, y: groundY(x), facing, pose, stride: 0 };
}

// A stick figure about 17 units tall, drawn with its feet at the origin,
// facing right. Legs and arms swing opposite each other with the stride.
export function StickFigure({ figure }: { figure: FigureFrame }) {
  const { x, y, facing, pose, stride } = figure;
  const running = pose === "run";
  const bounce = running ? -Math.abs(stride) * 0.7 : 0;
  const lean = running ? 1.4 : 0;

  const hip = { x: 0, y: -6.5 };
  const shoulder = { x: lean, y: -11.5 };
  const limb = (from: { x: number; y: number }, degrees: number, length: number) => {
    const r = (degrees * Math.PI) / 180;
    return `M${from.x} ${from.y}L${from.x + Math.sin(r) * length} ${from.y + Math.cos(r) * length}`;
  };

  const legSwing = running ? stride * 38 : 12;
  const armSwing = running ? stride * 45 : 14;
  const arms =
    pose === "look"
      ? // One hand shading the eyes, the other at the side.
        `M${shoulder.x} ${shoulder.y}L2.4 -12.2L1.2 -14.6${limb(shoulder, -14, 5)}`
      : `${limb(shoulder, -armSwing, 5)}${limb(shoulder, armSwing, 5)}`;

  return (
    <g
      data-part="figure"
      transform={`translate(${x} ${y + bounce})${facing === -1 ? " scale(-1 1)" : ""}`}
      stroke={INK}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <circle cx={lean + (pose === "look" ? 0.6 : 0)} cy="-14.3" r="2.3" fill={INK} stroke="none" />
      <path d={`M${shoulder.x} ${shoulder.y}L${hip.x} ${hip.y}`} />
      <path d={`${limb(hip, legSwing, 6.5)}${limb(hip, -legSwing, 6.5)}`} />
      <path d={arms} />
    </g>
  );
}
