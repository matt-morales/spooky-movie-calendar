// Siege: he runs into the house and shuts the door (as in run-for-it). Ten
// zombies rise up from behind the horizon and shamble toward the house, each
// a bit different. He boards up the three lower windows, two planks each. The
// zombies break the boards, batter the door open and file inside, and he
// sinks out of sight below a window among them.

import { StickFigure, runAcross, standAt, type FigureFrame } from "../actors";
import {
  CLIP,
  DOOR,
  INK,
  LOWER_WINDOWS,
  WINDOW,
  defineStory,
  easeInOut,
  groundY,
  lerp,
  progress,
  wrap,
  type SceneFrame,
  type WindowId,
} from "../scene";

export type ZombieKind = "armsOut" | "oneArm" | "dragLeg" | "crawler" | "hunched";

export interface ZombieSpec {
  id: number;
  kind: ZombieKind;
  from: number; // where on the horizon it rises
  appear: number; // when it starts to rise
  arrive: number; // when it reaches its spot at the house
  at: number; // its spot at the house
  scale: number; // some are further away / smaller
}

export interface ZombieFrame {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number; // feet (a crawler's belly) on the ground; lower while rising
  facing: 1 | -1;
  stride: number;
  scale: number;
  opacity: number; // fades as it goes in through the door
}

export interface BoardFrame {
  window: WindowId;
  slot: 0 | 1; // two crossed planks per window
  up: number; // 0..1 being put up
  fall: number; // 0..1 being knocked down
}

export interface SiegeFrame extends SceneFrame {
  figure: FigureFrame | null; // outdoors, running in
  builder: { window: WindowId; rise: number; hammer: number } | null; // boarding up, inside a window
  boards: BoardFrame[];
  zombies: ZombieFrame[];
  finale: { rise: number; others: number; sink: number } | null; // him and them in a window
}

// Beats of the story, in seconds.
export const BEATS = {
  runInFrom: 0.3,
  runInEnd: 2.6,
  inside: 2.9,
  closedAt: 3.4,
  riseFor: 1.5, // how long a zombie takes to climb up over the horizon
  boardFrom: 4.0,
  boardEach: 2.0, // per window
  boardedAt: 10.0,
  breakFrom: 13.2,
  breakEach: 0.4, // between planks
  breakTo: 15.65,
  rattleFrom: 15.4,
  burstAt: 16.6,
  enterFrom: 17.0,
  allInside: 22.2, // the far crawler is last through the door, at about 22.1
  finaleFrom: 22.5,
  finaleTo: 25.1,
  loop: 28.5,
} as const;

// Five from each side, spread along the horizon, all shaped a bit differently.
export const ZOMBIES: ZombieSpec[] = [
  { id: 0, kind: "armsOut", from: 70, appear: 3.2, arrive: 11.6, at: 188, scale: 1.0 },
  { id: 1, kind: "crawler", from: 110, appear: 3.6, arrive: 12.8, at: 182, scale: 0.95 },
  { id: 2, kind: "oneArm", from: 330, appear: 3.9, arrive: 11.8, at: 252, scale: 0.95 },
  { id: 3, kind: "dragLeg", from: 30, appear: 4.3, arrive: 12.4, at: 198, scale: 0.92 },
  { id: 4, kind: "armsOut", from: 372, appear: 4.6, arrive: 12.2, at: 262, scale: 0.9 },
  { id: 5, kind: "hunched", from: 140, appear: 5.0, arrive: 12.0, at: 206, scale: 0.97 },
  { id: 6, kind: "dragLeg", from: 305, appear: 5.4, arrive: 12.6, at: 240, scale: 1.0 },
  { id: 7, kind: "crawler", from: 350, appear: 5.8, arrive: 13.0, at: 268, scale: 0.9 },
  { id: 8, kind: "oneArm", from: 50, appear: 6.3, arrive: 12.9, at: 216, scale: 0.88 },
  { id: 9, kind: "armsOut", from: 390, appear: 6.8, arrive: 13.0, at: 224, scale: 0.94 },
];

// They go in nearest-the-door first.
const ENTER_ORDER = new Map(
  [...ZOMBIES].sort((a, b) => Math.abs(a.at - DOOR.x) - Math.abs(b.at - DOOR.x)).map((z, i) => [z.id, i]),
);
const ENTER_GAP = 0.3; // seconds between zombies starting for the door
const ENTER_SPEED = 24; // units per second
const ENTER_FADE = 0.35;

const START_X = -14;
const STILL: SiegeFrame = { door: 1, figure: null, builder: null, boards: [], zombies: [], finale: null };

function zombieAt(z: ZombieSpec, t: number): ZombieFrame | null {
  const b = BEATS;
  if (t < z.appear) return null;
  const enterStart = b.enterFrom + ENTER_ORDER.get(z.id)! * ENTER_GAP;
  const enterWalk = Math.abs(z.at - DOOR.x) / ENTER_SPEED;
  if (t >= enterStart + enterWalk + ENTER_FADE) return null; // gone inside

  const pace = z.kind === "crawler" ? 0.7 : 0.9; // shuffles per second
  const stride = Math.sin((t - z.appear) * pace * 2 * Math.PI + z.id);
  const base = { id: z.id, kind: z.kind, scale: z.scale, stride, opacity: 1 };
  const onGround = (x: number, facing: 1 | -1, opacity = 1): ZombieFrame => ({ ...base, x, y: groundY(x), facing, opacity });
  const towardHouse: 1 | -1 = z.at >= z.from ? 1 : -1;

  // Climbs up over the horizon.
  if (t < z.appear + b.riseFor) {
    const p = 1 - (1 - progress(t, z.appear, z.appear + b.riseFor)) ** 2;
    return { ...base, x: z.from, y: groundY(z.from) + (1 - p) * 22 * z.scale, facing: towardHouse };
  }
  // Shambles to its spot, lurching a little.
  if (t < z.arrive) {
    const x = lerp(z.from, z.at, progress(t, z.appear + b.riseFor, z.arrive)) + stride * 0.4;
    return onGround(x, towardHouse);
  }
  // Waits at the house, pounding, until the door gives.
  if (t < enterStart) return onGround(z.at, DOOR.x >= z.at ? 1 : -1);
  // Goes in through the door.
  const toDoor: 1 | -1 = DOOR.x >= z.at ? 1 : -1;
  if (t < enterStart + enterWalk) return onGround(lerp(z.at, DOOR.x, progress(t, enterStart, enterStart + enterWalk)), toDoor);
  return onGround(DOOR.x, toDoor, 1 - progress(t, enterStart + enterWalk, enterStart + enterWalk + ENTER_FADE));
}

function builderAt(t: number): SiegeFrame["builder"] {
  const b = BEATS;
  if (t < b.boardFrom || t >= b.boardedAt) return null;
  const i = Math.floor((t - b.boardFrom) / b.boardEach);
  const s = b.boardFrom + i * b.boardEach;
  const rise = Math.min(progress(t, s, s + 0.3), 1 - progress(t, s + 1.7, s + 2.0));
  const knock = (from: number) => (t >= from && t < from + 0.2 ? Math.abs(Math.sin(progress(t, from, from + 0.2) * Math.PI * 2)) : 0);
  return { window: LOWER_WINDOWS[i]!.id, rise: easeInOut(rise), hammer: knock(s + 0.8) + knock(s + 1.3) };
}

function boardsAt(t: number): BoardFrame[] {
  const b = BEATS;
  const boards: BoardFrame[] = [];
  LOWER_WINDOWS.forEach((w, i) => {
    for (const slot of [0, 1] as const) {
      const placed = b.boardFrom + i * b.boardEach + (slot === 0 ? 0.5 : 1.0);
      const up = progress(t, placed, placed + 0.3);
      const k = i * 2 + slot; // knocked down in the same order they went up
      const fall = progress(t, b.breakFrom + k * b.breakEach, b.breakFrom + k * b.breakEach + 0.45);
      if (up > 0 && fall < 1) boards.push({ window: w.id, slot, up, fall });
    }
  });
  return boards;
}

function doorAt(t: number): number {
  const b = BEATS;
  if (t < b.inside) return 1;
  if (t < b.rattleFrom) return 1 - easeInOut(progress(t, b.inside, b.closedAt));
  if (t < b.burstAt) return 0.16 * Math.abs(Math.sin((t - b.rattleFrom) * Math.PI * 2.5)); // jolting under the blows
  return 1 - (1 - progress(t, b.burstAt, b.burstAt + 0.2)) ** 3; // bursts open
}

function figureAt(t: number): FigureFrame | null {
  const b = BEATS;
  if (t < b.runInFrom || t >= b.inside) return null;
  if (t < b.runInEnd) return runAcross(t, b.runInFrom, b.runInEnd, START_X, DOOR.x);
  return standAt(DOOR.x, "stand", 1);
}

function finaleAt(t: number): SiegeFrame["finale"] {
  const b = BEATS;
  if (t < b.finaleFrom || t >= b.finaleTo) return null;
  return {
    rise: easeInOut(progress(t, b.finaleFrom, b.finaleFrom + 0.4)),
    others: easeInOut(progress(t, b.finaleFrom + 0.5, b.finaleFrom + 1.0)),
    sink: easeInOut(progress(t, b.finaleTo - 0.9, b.finaleTo)),
  };
}

export function frameAt(seconds: number): SiegeFrame {
  const t = wrap(seconds, BEATS.loop);
  return {
    door: doorAt(t),
    figure: figureAt(t),
    builder: builderAt(t),
    boards: boardsAt(t),
    zombies: ZOMBIES.map((z) => zombieAt(z, t)).filter((z): z is ZombieFrame => z !== null),
    finale: finaleAt(t),
  };
}

export const siege = defineStory<SiegeFrame>({
  id: "siege",
  title: "Siege",
  loop: BEATS.loop,
  still: STILL,
  frameAt,
  Inside: ({ frame }) => (
    <>
      {frame.builder && <Builder {...frame.builder} />}
      {frame.boards.map((b) => (
        <Board key={`${b.window}-${b.slot}`} {...b} />
      ))}
      {frame.finale && <Finale {...frame.finale} />}
    </>
  ),
  Outside: ({ frame }) => (
    <>
      {frame.figure && <StickFigure figure={frame.figure} />}
      {frame.zombies.length > 0 && (
        <g data-part="horde" clipPath={CLIP.aboveHorizon}>
          {frame.zombies.map((z) => (
            <Zombie key={z.id} zombie={z} />
          ))}
        </g>
      )}
    </>
  ),
});

const windowById = (id: WindowId) => LOWER_WINDOWS.find((w) => w.id === id)!;

// ------------------------------------------------------------------ inside

// Him in a window, arms up holding a plank in place, bobbing as he hammers.
function Builder({ window, rise, hammer }: { window: WindowId; rise: number; hammer: number }) {
  const w = windowById(window);
  const cx = w.x + w.width / 2;
  const bottom = w.y + w.height;
  const shoulder = { x: cx, y: bottom - 5 };
  return (
    <g data-part="builder" clipPath={w.clip}>
      <g transform={`translate(0 ${(1 - rise) * w.height + hammer * 0.9})`}>
        <circle cx={cx} cy={w.y + 4.4} r="2.1" fill={INK} />
        <path
          d={`M${cx} ${bottom + 1}L${shoulder.x} ${shoulder.y}M${shoulder.x} ${shoulder.y}L${cx - 3.4} ${w.y + 2.2}M${shoulder.x} ${shoulder.y}L${cx + 3.4} ${w.y + 2.2}`}
          stroke={INK}
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </g>
  );
}

// A plank nailed across a window; two cross to make an X. It slides into
// place when put up, and twists and drops away when knocked down.
function Board({ window, slot, up, fall }: BoardFrame) {
  const w = windowById(window);
  const [y0, y1] = slot === 0 ? [0.72, 0.28] : [0.3, 0.78];
  const a = { x: w.x - 1, y: w.y + w.height * y0 };
  const b = { x: w.x + w.width + 1, y: w.y + w.height * y1 };
  const transform = `translate(0 ${(1 - up) * -2 + fall * 10}) rotate(${fall * (slot === 0 ? 35 : -35)} ${a.x} ${a.y})`;
  return (
    <g data-part="board" clipPath={w.clip} opacity={up * (1 - fall * 0.5)}>
      <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} transform={transform} stroke="#4f321d" strokeWidth="2.4" />
    </g>
  );
}

// The end: him in the window, arms flung up, zombie heads either side, and
// then all of them dropping out of sight.
function Finale({ rise, others, sink }: { rise: number; others: number; sink: number }) {
  const w = WINDOW;
  const cx = w.x + w.width / 2;
  const bottom = w.y + w.height;
  const drop = (1 - rise) * w.height + sink * (w.height + 4);
  const theirs = (1 - others) * w.height;
  return (
    <g data-part="finale" clipPath={CLIP.window}>
      <g transform={`translate(0 ${drop})`}>
        <circle cx={cx} cy={w.y + 5} r="2" fill={INK} />
        <path
          d={`M${cx} ${bottom + 1}L${cx} ${bottom - 4.5}M${cx} ${bottom - 4.5}L${cx - 3} ${w.y + 1.5}M${cx} ${bottom - 4.5}L${cx + 3} ${w.y + 1.5}`}
          stroke={INK}
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
        <g transform={`translate(0 ${theirs})`} fill={ZOMBIE}>
          <circle cx={w.x + 1.6} cy={w.y + 7.5} r="2.1" />
          <circle cx={w.x + w.width - 1.4} cy={w.y + 8.2} r="2.1" />
        </g>
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ outside

const ZOMBIE = "#2c3b2f"; // rotten green-grey, so they show against the black house

type Pt = { x: number; y: number };
const r2 = (n: number) => Math.round(n * 100) / 100;
const seg = (a: Pt, b: Pt) => `M${r2(a.x)} ${r2(a.y)}L${r2(b.x)} ${r2(b.y)}`;
const limb = (from: Pt, degrees: number, length: number): Pt => {
  // degrees from straight down, positive toward the way it faces
  const r = (degrees * Math.PI) / 180;
  return { x: from.x + Math.sin(r) * length, y: from.y + Math.cos(r) * length };
};

// Each zombie drawn with its feet at the origin, facing right, scaled.
function Zombie({ zombie }: { zombie: ZombieFrame }) {
  const { kind, x, y, facing, stride, scale, opacity } = zombie;
  const bob = Math.abs(stride) * 0.4;
  let head: Pt;
  let lines: string;

  if (kind === "crawler") {
    // No legs: dragging itself along on its arms, belly to the ground.
    const hip = { x: -5, y: -1.8 };
    const shoulder = { x: 1.4, y: -2.9 };
    head = { x: 3.6, y: -3.9 };
    const reach = (s: number): Pt => ({ x: shoulder.x + 3.4 + s * 1.8, y: 0 });
    const elbow = (s: number): Pt => ({ x: shoulder.x + 1.6 + s * 0.8, y: -4.2 - Math.max(0, s) * 0.8 });
    lines =
      seg(hip, shoulder) +
      seg(shoulder, elbow(stride)) + seg(elbow(stride), reach(stride)) +
      seg(shoulder, elbow(-stride)) + seg(elbow(-stride), reach(-stride)) +
      seg(hip, { x: -6.6, y: -0.7 }); // what's left of a leg
  } else if (kind === "hunched") {
    const hip = { x: 0, y: -6 };
    const shoulder = { x: 2.4, y: -9.4 + bob };
    head = { x: 4.4, y: -10.6 + bob };
    lines =
      seg(hip, shoulder) +
      seg(hip, limb(hip, stride * 12 + 6, 6.2)) + seg(hip, limb(hip, -stride * 12 + 6, 6.2)) +
      seg(shoulder, limb(shoulder, 10 + stride * 8, 5.4)) + seg(shoulder, limb(shoulder, -4 - stride * 8, 5));
  } else if (kind === "dragLeg") {
    const hip = { x: 0, y: -6.5 };
    const shoulder = { x: 1.6, y: -10.9 + bob };
    head = { x: 2.8, y: -13.4 + bob };
    lines =
      seg(hip, shoulder) +
      seg(hip, limb(hip, stride * 16, 6.5)) + seg(hip, { x: -4.9, y: -0.3 }) + // one leg dragged behind
      seg(shoulder, limb(shoulder, 38 + stride * 6, 5)) + seg(shoulder, limb(shoulder, 52 - stride * 6, 4.8));
  } else {
    // Arms held out in front; one of them missing for "oneArm".
    const hip = { x: 0, y: -6.5 };
    const shoulder = { x: 1.2, y: -11.2 + bob };
    head = { x: 2.5, y: -13.8 + bob };
    const arm = (lift: number) => ({ x: shoulder.x + 5, y: shoulder.y - lift });
    lines =
      seg(hip, shoulder) +
      seg(hip, limb(hip, stride * 14 + 4, 6.5)) + seg(hip, limb(hip, -stride * 14 + 4, 6.5)) +
      seg(shoulder, arm(0.8 + stride * 0.5)) +
      (kind === "oneArm" ? seg(shoulder, { x: shoulder.x + 0.6, y: shoulder.y + 1.8 }) : seg(shoulder, arm(-0.4 - stride * 0.5)));
  }

  return (
    <g
      data-part="zombie"
      data-kind={kind}
      opacity={opacity}
      transform={`translate(${x} ${y}) scale(${facing * scale} ${scale})`}
    >
      <path d={lines} stroke={ZOMBIE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={r2(head.x)} cy={r2(head.y)} r="2.1" fill={ZOMBIE} />
    </g>
  );
}
