// The little story played by the haunted house in the sidebar:
//
//   a stick figure runs into the house and shuts the door, peers out of an
//   upstairs window, comes back down, opens the door, looks left, then right,
//   and runs off-screen. Then the scene rests and the story loops.
//
// storyAt(t) is a pure function from time to what to draw, so the whole
// sequence is unit-tested; HauntedHouse just renders its result.
// Coordinates are in the house SVG's viewBox (400 × 320).

export type Pose = "run" | "stand" | "look";

export interface FigureFrame {
  x: number; // feet, horizontally
  y: number; // feet, on the ground
  facing: 1 | -1; // 1 = right
  pose: Pose;
  stride: number; // -1..1 swing of legs and arms; 0 when still
}

export interface StoryFrame {
  figure: FigureFrame | null; // null when it's indoors or off-screen
  door: number; // 0 = shut, 1 = open
  peek: { rise: number; look: number } | null; // head and shoulders in the upstairs window
}

// Features of the drawn house.
export const DOOR = { x: 231.5, left: 226, top: 272, width: 11, height: 20 };
export const WINDOW = { x: 206, y: 248, width: 11, height: 14 }; // upstairs, nearest the door

// Beats of the story, in seconds.
export const STORY = {
  runInEnd: 2.6,
  inside: 2.9, // steps through the doorway
  closedAt: 3.4,
  peekFrom: 4.6,
  peekTo: 7.8,
  opensFrom: 9.0,
  openAt: 9.5,
  lookLeftAt: 10.0,
  lookRightAt: 10.9,
  runOutFrom: 12.1,
  runOutEnd: 14.6,
  loop: 24,
} as const;

const START_X = -14;
const END_X = 425;
const STRIDES_PER_SECOND = 3.2;

// The ground line drawn in the SVG: "M0 296 C80 280 160 292 222 290
// 290 288 340 276 400 286". Sampled once so groundY is a cheap lookup.
const GROUND: Array<[number, number]> = (() => {
  const segments: Array<[number, number][]> = [
    [[0, 296], [80, 280], [160, 292], [222, 290]],
    [[222, 290], [290, 288], [340, 276], [400, 286]],
  ];
  const points: Array<[number, number]> = [];
  for (const [p0, p1, p2, p3] of segments as Array<[[number, number], [number, number], [number, number], [number, number]]>) {
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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const progress = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function running(t: number, from: number, to: number, x0: number, x1: number): FigureFrame {
  const x = lerp(x0, x1, progress(t, from, to));
  return {
    x,
    y: groundY(x),
    facing: x1 >= x0 ? 1 : -1,
    pose: "run",
    stride: Math.sin((t - from) * STRIDES_PER_SECOND * 2 * Math.PI),
  };
}

function standing(pose: Pose, facing: 1 | -1): FigureFrame {
  return { x: DOOR.x, y: groundY(DOOR.x), facing, pose, stride: 0 };
}

export function storyAt(seconds: number): StoryFrame {
  const s = STORY;
  const wrapped = seconds % s.loop;
  const t = wrapped < 0 ? wrapped + s.loop : wrapped;
  const rest: StoryFrame = { figure: null, door: 1, peek: null };

  // Runs in and steps through the doorway.
  if (t < s.runInEnd) return { ...rest, figure: running(t, 0, s.runInEnd, START_X, DOOR.x) };
  if (t < s.inside) return { ...rest, figure: standing("stand", 1) };

  // Shuts the door behind it.
  if (t < s.peekFrom) return { ...rest, door: 1 - easeInOut(progress(t, s.inside, s.closedAt)) };

  // Upstairs: rises into the window, looks one way, then the other, ducks away.
  if (t <= s.peekTo) {
    const rise = Math.min(progress(t, s.peekFrom, s.peekFrom + 0.4), 1 - progress(t, s.peekTo - 0.4, s.peekTo));
    const middle = (s.peekFrom + s.peekTo) / 2;
    const look = rise < 1 ? 0 : t < middle ? -1 : 1;
    return { ...rest, door: 0, peek: { rise: easeInOut(rise), look } };
  }

  // Comes downstairs; the door swings open with it standing in the doorway.
  if (t < s.opensFrom) return { ...rest, door: 0 };
  if (t < s.lookLeftAt) {
    return { ...rest, door: easeInOut(progress(t, s.opensFrom, s.openAt)), figure: standing("stand", 1) };
  }

  // Looks left, then right, then pauses a beat.
  if (t < s.lookRightAt) return { ...rest, figure: standing("look", -1) };
  if (t < s.lookRightAt + 0.9) return { ...rest, figure: standing("look", 1) };
  if (t < s.runOutFrom) return { ...rest, figure: standing("stand", 1) };

  // Runs out and off-screen.
  if (t <= s.runOutEnd) return { ...rest, figure: running(t, s.runOutFrom, s.runOutEnd, DOOR.x, END_X) };

  return rest;
}
