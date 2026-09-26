// The stage shared by every haunted-house story: the house's features, the
// ground line, timing helpers, and the shape of a story.
//
// Coordinates are in the house SVG's viewBox (400 × 320). To add a story, see
// stories/index.ts.

import type { ComponentType } from "react";

/** The silhouette colour of the house, the trees and anyone walking about. */
export const INK = "#050303";

// Features of the drawn house.
export const DOOR = { x: 231.5, left: 226, top: 272, width: 11, height: 20 };
export const WINDOW = { x: 206, y: 248, width: 11, height: 14 }; // upstairs, nearest the door
export const ATTIC = { x: 216, y: 214, width: 9, height: 10 }; // the small window under the roof peak

/** Clip paths and filters defined by the stage, for stories to draw with. */
export const CLIP = { window: "url(#sb-window)", attic: "url(#sb-attic)" } as const;
export const FILTER = { windowGlow: "url(#sb-glow)", eyeGlow: "url(#sb-eye-glow)" } as const;

/** What the stage itself needs from every frame of a story. */
export interface SceneFrame {
  door: number; // 0 = shut, 1 = open (as drawn)
}

/**
 * A short animation acted out around the house. It loops; the stage picks one
 * story at random when the page loads.
 *
 * - frameAt(t) is a pure function from seconds (0 ≤ t < loop) to what to draw.
 *   It must start and end with the house as drawn (`still`), so the loop and
 *   the reduced-motion view are seamless (enforced by stories/contract.test).
 * - Inside draws in the windows: over the window light, behind the window bars.
 * - Outside draws outdoors: over the ground, behind the big trees in front.
 */
export interface HouseStory<F extends SceneFrame = SceneFrame> {
  id: string; // for ?story=<id>
  title: string;
  loop: number; // seconds, including a quiet rest at the end
  still: F; // the house as drawn: shown before the story starts and for reduced motion
  frameAt(t: number): F;
  Inside?: ComponentType<{ frame: F }>;
  Outside?: ComponentType<{ frame: F }>;
}

export type AnyHouseStory = HouseStory<SceneFrame>;

/** Declares a story, keeping its own frame type while it's written. */
export function defineStory<F extends SceneFrame>(story: HouseStory<F>): AnyHouseStory {
  return story as unknown as AnyHouseStory;
}

// ---------------------------------------------------------------- timing

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0..1 through the span from..to. */
export const progress = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
export const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** t wrapped into [0, loop). */
export function wrap(t: number, loop: number): number {
  const w = t % loop;
  return w < 0 ? w + loop : w;
}

// ---------------------------------------------------------------- ground

// The ground line drawn in the SVG: "M0 296 C80 280 160 292 222 290
// 290 288 340 276 400 286". Sampled once so groundY is a cheap lookup.
type Point = [number, number];
const GROUND: Point[] = (() => {
  const segments: Array<[Point, Point, Point, Point]> = [
    [[0, 296], [80, 280], [160, 292], [222, 290]],
    [[222, 290], [290, 288], [340, 276], [400, 286]],
  ];
  const points: Point[] = [];
  for (const [p0, p1, p2, p3] of segments) {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const u = 1 - t;
      const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
      points.push([
        b[0] * p0[0] + b[1] * p1[0] + b[2] * p2[0] + b[3] * p3[0],
        b[0] * p0[1] + b[1] * p1[1] + b[2] * p2[1] + b[3] * p3[1],
      ]);
    }
  }
  return points;
})();

/** Height of the ground at x, so feet stay on the hill. */
export function groundY(x: number): number {
  const first = GROUND[0]!;
  const last = GROUND[GROUND.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < GROUND.length; i++) {
    const [x1, y1] = GROUND[i]!;
    const [x0, y0] = GROUND[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return last[1];
}
