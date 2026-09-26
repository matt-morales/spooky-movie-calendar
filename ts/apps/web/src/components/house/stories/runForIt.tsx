// Run for it: a stick figure runs into the house and shuts the door, peers
// out of an upstairs window, comes back down, opens the door, looks left, then
// right, and runs off-screen. Then something rises into the attic window, eyes
// glowing red, raises a knife and heads downstairs after him.

import { StickFigure, runAcross, standAt, type FigureFrame } from "../actors";
import {
  ATTIC,
  CLIP,
  DOOR,
  FILTER,
  INK,
  WINDOW,
  defineStory,
  easeInOut,
  progress,
  wrap,
  type SceneFrame,
} from "../scene";

export interface RunForItFrame extends SceneFrame {
  figure: FigureFrame | null; // null when it's indoors or off-screen
  peek: { rise: number; look: number } | null; // head and shoulders in the upstairs window
  lurker: LurkerFrame | null; // the thing in the attic window
}

// Each part runs 0..1: rising from below the sill, the eyes lighting up, the
// knife arm going up, and leaving to the left (down the stairs).
export interface LurkerFrame {
  rise: number;
  eyes: number;
  knife: number;
  exit: number;
}

// Beats of the story, in seconds.
export const STORY = {
  runInFrom: 0.3, // a moment of empty scene first, so the loop starts on the still frame
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
  lurkFrom: 15.4,
  lurkTo: 21.4,
  loop: 25,
} as const;

const START_X = -14;
const END_X = 425;

const STILL: RunForItFrame = { figure: null, door: 1, peek: null, lurker: null };

function frameAt(seconds: number): RunForItFrame {
  const s = STORY;
  const t = wrap(seconds, s.loop);
  const rest = STILL;

  // Runs in and steps through the doorway.
  if (t < s.runInFrom) return rest;
  if (t < s.runInEnd) return { ...rest, figure: runAcross(t, s.runInFrom, s.runInEnd, START_X, DOOR.x) };
  if (t < s.inside) return { ...rest, figure: standAt(DOOR.x, "stand", 1) };

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
    return { ...rest, door: easeInOut(progress(t, s.opensFrom, s.openAt)), figure: standAt(DOOR.x, "stand", 1) };
  }

  // Looks left, then right, then pauses a beat.
  if (t < s.lookRightAt) return { ...rest, figure: standAt(DOOR.x, "look", -1) };
  if (t < s.lookRightAt + 0.9) return { ...rest, figure: standAt(DOOR.x, "look", 1) };
  if (t < s.runOutFrom) return { ...rest, figure: standAt(DOOR.x, "stand", 1) };

  // Runs out and off-screen.
  if (t <= s.runOutEnd) return { ...rest, figure: runAcross(t, s.runOutFrom, s.runOutEnd, DOOR.x, END_X) };

  // Something rises into the attic window and goes downstairs after him.
  if (t > s.lurkFrom && t < s.lurkTo) return { ...rest, lurker: lurkerAt(progress(t, s.lurkFrom, s.lurkTo)) };

  return rest;
}

function lurkerAt(p: number): LurkerFrame {
  return {
    rise: easeInOut(progress(p, 0, 0.3)), // slowly: about two seconds
    eyes: progress(p, 0.32, 0.4),
    knife: easeInOut(progress(p, 0.42, 0.52)),
    exit: easeInOut(progress(p, 0.72, 1)),
  };
}

export { frameAt };

export const runForIt = defineStory<RunForItFrame>({
  id: "run-for-it",
  title: "Run for it",
  loop: STORY.loop,
  still: STILL,
  frameAt,
  Inside: ({ frame }) => (
    <>
      {frame.peek && <WindowPeek rise={frame.peek.rise} look={frame.peek.look} />}
      {frame.lurker && <Lurker {...frame.lurker} />}
    </>
  ),
  Outside: ({ frame }) => (frame.figure ? <StickFigure figure={frame.figure} /> : null),
});

// Head and shoulders rising into the upstairs window. The window's crossbars
// split it into four panes; looking left or right moves the head into the
// upper-left or upper-right pane so it reads clearly at this size.
function WindowPeek({ rise, look }: { rise: number; look: number }) {
  const cx = WINDOW.x + WINDOW.width / 2;
  const bottom = WINDOW.y + WINDOW.height;
  const drop = (1 - rise) * WINDOW.height;
  const lean = look * 2.8;
  return (
    <g data-part="peek" fill={INK} clipPath={CLIP.window}>
      <g transform={`translate(0 ${drop})`}>
        <circle cx={cx + lean} cy={WINDOW.y + 3.9} r="2.2" />
        <path
          d={`M${cx + lean * 0.4 - 5} ${bottom}Q${cx + lean * 0.4 - 5} ${bottom - 5.5} ${cx + lean * 0.4} ${bottom - 5.5}Q${cx + lean * 0.4 + 5} ${bottom - 5.5} ${cx + lean * 0.4 + 5} ${bottom}Z`}
        />
      </g>
    </g>
  );
}

// A hunched, hooded figure in the attic window, drawn with the middle of its
// shoulders at the sill. It rises from below, its eyes light up red, it
// raises a knife, then slips away to the left and down, as if taking the
// stairs. Everything is clipped to the window.
function Lurker({ rise, eyes, knife, exit }: LurkerFrame) {
  const x = ATTIC.x + ATTIC.width / 2 - exit * 11;
  const y = ATTIC.y + ATTIC.height + (1 - rise) * 11 + exit * 3 - Math.abs(Math.sin(exit * Math.PI * 4)) * 0.6;

  // The knife arm swings from hanging down (165°) to held high (12°), in
  // degrees from straight up. The blade carries on from the hand.
  const shoulder = { x: 3.2, y: -3.8 };
  const angle = ((165 - 153 * knife) * Math.PI) / 180;
  const dir = { x: Math.sin(angle), y: -Math.cos(angle) };
  const hand = { x: shoulder.x + dir.x * 3.6, y: shoulder.y + dir.y * 3.6 };
  const tip = { x: hand.x + dir.x * 2.6, y: hand.y + dir.y * 2.6 };

  return (
    <g data-part="lurker" clipPath={CLIP.attic}>
      <g transform={`translate(${x} ${y})`}>
        <path
          d="M-4.8 1L-4.5-2.6Q-4-4.2-2.3-4.6Q-3-6.3-2.7-7.6Q-2.2-9.6 0-9.9Q2.2-9.6 2.7-7.6Q3-6.3 2.3-4.6Q4-4.2 4.5-2.6L4.8 1Z"
          fill={INK}
        />
        <path
          d={`M${shoulder.x} ${shoulder.y}L${hand.x} ${hand.y}`}
          stroke={INK}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          data-part="knife"
          d={`M${hand.x} ${hand.y}L${tip.x} ${tip.y}`}
          stroke="#f7f3f3"
          strokeWidth="1.05"
          strokeLinecap="round"
        />
        {/* Slanted, glowing eyes in the dark of the hood. */}
        <g data-part="lurker-eyes" opacity={eyes} fill="#ff5a3c" filter={FILTER.eyeGlow}>
          <ellipse cx="-1.05" cy="-6.6" rx="0.8" ry="0.46" transform="rotate(18 -1.05 -6.6)" />
          <ellipse cx="1.05" cy="-6.6" rx="0.8" ry="0.46" transform="rotate(-18 1.05 -6.6)" />
        </g>
      </g>
    </g>
  );
}
