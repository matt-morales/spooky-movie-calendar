// Abduction: someone sits watching TV in the wing window, door shut. A UFO
// flies in from the left and hovers beside the house, the lights on its lower
// half turning and an alien in its dome. He switches the TV off, opens the
// door, looks left and right, and walks out to stand under it. He looks up; a
// beam shines down and carries him up, limp and horizontal, into the UFO,
// which flies away. The door he left open swings shut by itself.

import { MIDDLE, StickFigure, standAt, walkAcross, type FigureFrame } from "../actors";
import {
  CLIP,
  DOOR,
  FILTER,
  WING,
  defineStory,
  easeInOut,
  groundY,
  lerp,
  progress,
  wrap,
  type SceneFrame,
} from "../scene";

export interface UfoFrame {
  x: number; // centre of the saucer
  y: number;
  scale: number; // 1 = hovering nearby; smaller as it flies off into the distance
  tilt: number; // degrees
  spin: number; // radians: how far the lights on the lower half have turned
}

export interface AbductionFrame extends SceneFrame {
  tv: number; // brightness of the TV's glow in the wing window, 0 = off
  watcher: { show: number; stand: number; leave: number } | null; // the person watching TV
  ufo: UfoFrame | null;
  beam: number; // 0..1
  figure: FigureFrame | null; // outdoors
}

/** Where the UFO hovers: to the left of the house, with room for the beam. */
export const HOVER = { x: 118, y: 214 };

// Beats of the story, in seconds.
export const BEATS = {
  tvOn: 1.0, // fade in by
  ufoIn: 1.0,
  ufoArrives: 5.0,
  tvOff: 8.0,
  standUp: 8.4,
  leftWindow: 9.2,
  doorFrom: 10.6,
  doorOpen: 11.1,
  lookLeft: 11.6,
  lookRight: 12.4,
  walkFrom: 13.4,
  walkTo: 17.0,
  lookUp: 17.0,
  beamOn: 17.8,
  liftFrom: 18.2,
  liftTo: 22.0,
  beamOff: 22.2,
  flyOff: 22.8,
  flyOffEnd: 25.0,
  doorCloseFrom: 25.8,
  doorClosed: 28.3,
  loop: 30,
} as const;

const STILL: AbductionFrame = { door: 0, tv: 0, watcher: null, ufo: null, beam: 0, figure: null };

// Flickering, deterministic in t so frames stay pure.
const tvFlicker = (t: number) => 0.7 + 0.15 * (Math.sin(t * 11.3) * Math.sin(t * 4.7) + 1);
const beamFlicker = (t: number) => 0.85 + 0.15 * Math.sin(t * 23);

function ufoAt(t: number): UfoFrame | null {
  const b = BEATS;
  if (t < b.ufoIn || t > b.flyOffEnd) return null;
  const spin = t * Math.PI; // half a turn a second
  const bob = Math.sin(t * Math.PI) * 1.2;
  if (t < b.ufoArrives) {
    const p = 1 - (1 - progress(t, b.ufoIn, b.ufoArrives)) ** 3; // ease out: glides in and settles
    return { x: lerp(-40, HOVER.x, p), y: lerp(150, HOVER.y, p) + bob * p, scale: 1, tilt: lerp(-10, 0, p), spin };
  }
  if (t < b.flyOff) return { x: HOVER.x, y: HOVER.y + bob, scale: 1, tilt: 0, spin };
  const p = progress(t, b.flyOff, b.flyOffEnd) ** 2; // ease in: accelerates away
  return { x: HOVER.x + p * 330, y: HOVER.y + bob - p * 200, scale: 1 - 0.6 * p, tilt: 12 * Math.min(1, p * 4), spin };
}

function tvAt(t: number): number {
  const b = BEATS;
  if (t >= b.tvOff + 0.15) return 0;
  const on = progress(t, 0, b.tvOn) * (1 - progress(t, b.tvOff, b.tvOff + 0.15));
  return on * tvFlicker(t);
}

function beamAt(t: number): number {
  const b = BEATS;
  const level = Math.min(progress(t, b.beamOn, b.beamOn + 0.3), 1 - progress(t, b.beamOff, b.beamOff + 0.3));
  return level > 0 ? level * beamFlicker(t) : 0;
}

function figureAt(t: number): FigureFrame | null {
  const b = BEATS;
  if (t < b.doorFrom || t >= b.liftTo) return null;
  if (t < b.lookLeft) return standAt(DOOR.x, "stand", -1);
  if (t < b.lookRight) return standAt(DOOR.x, "look", -1);
  if (t < b.lookRight + 0.8) return standAt(DOOR.x, "look", 1);
  if (t < b.walkFrom) return standAt(DOOR.x, "stand", -1);
  if (t < b.walkTo) return walkAcross(t, b.walkFrom, b.walkTo, DOOR.x, HOVER.x);
  if (t < b.liftFrom) return standAt(HOVER.x, "lookUp", -1);

  // Lifted by the middle: tips over to horizontal first, then rises into the
  // underside of the saucer, arms and legs dangling.
  const start = groundY(HOVER.x) - MIDDLE;
  const underside = HOVER.y + 4;
  const tip = progress(t, b.liftFrom, b.liftFrom + 0.8);
  const rise = easeInOut(progress(t, b.liftFrom + 0.4, b.liftTo));
  return {
    x: HOVER.x,
    y: lerp(start - 3 * tip, underside, rise),
    facing: -1,
    pose: "carried",
    stride: Math.sin(t * 2 * Math.PI * 0.6) * 0.6,
    tilt: easeInOut(tip),
  };
}

function doorAt(t: number): number {
  const b = BEATS;
  if (t < b.doorCloseFrom) return easeInOut(progress(t, b.doorFrom, b.doorOpen));
  return 1 - easeInOut(progress(t, b.doorCloseFrom, b.doorClosed)); // creaks shut on its own
}

function watcherAt(t: number): AbductionFrame["watcher"] {
  const b = BEATS;
  const show = progress(t, 0, b.tvOn);
  if (show === 0 || t >= b.leftWindow) return null;
  return { show, stand: easeInOut(progress(t, b.standUp, b.standUp + 0.2)), leave: easeInOut(progress(t, b.standUp + 0.2, b.leftWindow)) };
}

export function frameAt(seconds: number): AbductionFrame {
  const t = wrap(seconds, BEATS.loop);
  return {
    door: doorAt(t),
    tv: tvAt(t),
    watcher: watcherAt(t),
    ufo: ufoAt(t),
    beam: beamAt(t),
    figure: figureAt(t),
  };
}

export const abduction = defineStory<AbductionFrame>({
  id: "abduction",
  title: "Abduction",
  loop: BEATS.loop,
  still: STILL,
  frameAt,
  Inside: ({ frame }) => (
    <>
      {frame.tv > 0 && <TvGlow level={frame.tv} />}
      {frame.watcher && <Watcher {...frame.watcher} />}
    </>
  ),
  Outside: ({ frame }) => (
    <>
      {frame.beam > 0 && frame.ufo && <Beam ufo={frame.ufo} level={frame.beam} />}
      {frame.figure && <StickFigure figure={frame.figure} />}
      {frame.ufo && <Ufo {...frame.ufo} />}
    </>
  ),
});

// Blue TV light over the room's red glow, spilling a little onto the wall.
function TvGlow({ level }: { level: number }) {
  return (
    <>
      <rect
        x={WING.x}
        y={WING.y}
        width={WING.width}
        height={WING.height}
        fill="#5fb0ff"
        opacity={0.35 * level}
        filter={FILTER.windowGlow}
      />
      <rect data-part="tv" x={WING.x} y={WING.y} width={WING.width} height={WING.height} fill="#9fd4ff" opacity={0.8 * level} />
    </>
  );
}

// Seated in silhouette, facing the TV off to the right. Stands, then walks
// out of the window to the left.
function Watcher({ show, stand, leave }: { show: number; stand: number; leave: number }) {
  return (
    <g data-part="watcher" clipPath={CLIP.wing} opacity={show}>
      <g transform={`translate(${-leave * 9} ${-stand * 2})`} fill="#050303">
        <circle cx="254" cy="267.4" r="1.9" />
        <path d="M250 274.5Q250.4 270 253.4 269.9Q256.6 269.9 257.2 274.5Z" />
      </g>
    </g>
  );
}

function Beam({ ufo, level }: { ufo: UfoFrame; level: number }) {
  const top = ufo.y + 4 * ufo.scale;
  const ground = groundY(ufo.x) + 2;
  return (
    <g data-part="beam" opacity={0.6 * level}>
      <defs>
        <linearGradient id="ab-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6fff1" stopOpacity="0.95" />
          <stop offset="1" stopColor="#9dffcb" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path
        d={`M${ufo.x - 5} ${top}L${ufo.x + 5} ${top}L${ufo.x + 13} ${ground}L${ufo.x - 13} ${ground}Z`}
        fill="url(#ab-beam)"
      />
      <ellipse cx={ufo.x} cy={ground} rx="14" ry="2.2" fill="#c8ffe0" opacity="0.6" />
    </g>
  );
}

const LIGHT_COLOURS = ["#ffffff", "#5dff8a", "#5fb4ff", "#ff4d4d"];

// A saucer: a glass dome with an alien inside, a metal rim, and a lower half
// whose ring of coloured lights turns (lights on the far side are hidden).
function Ufo({ x, y, scale, tilt, spin }: UfoFrame) {
  const lights = Array.from({ length: 8 }, (_, i) => {
    const a = spin + (i * Math.PI) / 4;
    const front = Math.min(1, Math.max(0, (Math.sin(a) + 0.25) / 0.6));
    return { x: 11 * Math.cos(a), y: 1.6 + 2.6 * Math.sin(a), front, fill: LIGHT_COLOURS[i % LIGHT_COLOURS.length]! };
  });
  return (
    <g data-part="ufo" transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}>
      {/* Dome, with the alien's silhouette inside */}
      <path d="M-7.5-3.2A7.5 8.5 0 0 1 7.5-3.2Z" fill="#bfefff" fillOpacity="0.16" />
      <g data-part="alien">
        <path d="M0-10.8C2.7-10.8 3.3-8.6 2.5-7.1C1.9-5.9 0.9-5.3 0-5.3C-0.9-5.3-1.9-5.9-2.5-7.1C-3.3-8.6-2.7-10.8 0-10.8Z" fill="#0c1411" />
        <path d="M-3.4-3.2Q-3-5.1 0-5.1Q3-5.1 3.4-3.2Z" fill="#0c1411" />
        <g fill="#8dffb4" filter={FILTER.eyeGlow}>
          <ellipse cx="-1.05" cy="-7.9" rx="0.75" ry="0.4" transform="rotate(20 -1.05 -7.9)" />
          <ellipse cx="1.05" cy="-7.9" rx="0.75" ry="0.4" transform="rotate(-20 1.05 -7.9)" />
        </g>
      </g>
      <path d="M-7.5-3.2A7.5 8.5 0 0 1 7.5-3.2" fill="none" stroke="#d8f4ff" strokeOpacity="0.55" strokeWidth="0.6" />

      {/* Lower half with its turning lights */}
      <ellipse cx="0" cy="1.6" rx="12" ry="3.6" fill="#16171d" />
      <g data-part="ufo-lights" filter={FILTER.eyeGlow}>
        {lights.map((l, i) => (
          <circle key={i} cx={l.x} cy={l.y} r="0.95" fill={l.fill} opacity={l.front} />
        ))}
      </g>

      {/* Rim */}
      <ellipse cx="0" cy="-1.2" rx="17" ry="3.9" fill="#262833" stroke="#9aa0b5" strokeOpacity="0.45" strokeWidth="0.6" />
      <path d="M-14-2.4Q0-5.6 14-2.4" fill="none" stroke="#c9cfdf" strokeOpacity="0.3" strokeWidth="0.6" />
    </g>
  );
}
