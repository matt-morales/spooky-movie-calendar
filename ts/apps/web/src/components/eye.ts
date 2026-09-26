// How the title's sleepless eye moves: an endless run of short "beats"
// picked at random so it never settles into a rhythm. Pure data, so the
// component only has to play it back.
//
// Left alone the eye is drowsy: it keeps drifting off and dragging itself
// awake, lazily looking left and right. Disturb it (move the mouse, touch the
// screen) and it jolts awake and looks around, paranoid, until things go
// quiet and it settles back down. Its gaze always moves in jumps like a real
// eye; what makes it unsettling is the timing.

/** Where the eye is, in the eye's SVG units. */
export type Gaze = {
  x: number; // iris offset from centre
  y: number;
  lid: number; // 0 = wide open, REST_LID = heavy and tired, 1 = shut
  pupil: number; // pupil scale
};

/** Move to `gaze` over `ms`, then hold it for `hold` ms. */
export type EyeStep = Gaze & { ms: number; hold: number };

export type Mood = "drowsy" | "alert";
type DrowsyBeat = "doze" | "drift" | "sleep" | "settle";
type AlertBeat = "startle" | "stare" | "glance" | "checkBehind" | "sideEye" | "blink";
export type BeatName = DrowsyBeat | AlertBeat;
export type Beat = { name: BeatName; mood: Mood; steps: EyeStep[] };

export const MAX_X = 14;
export const MAX_Y = 3;
export const REST_LID = 0.35;
export const REST: EyeStep = { x: 0, y: 0, lid: REST_LID, pupil: 1, ms: 0, hold: 1 };

const SACCADE = 60; // ms: a startled eye snaps between points
const LAZY = 150; // ms: a sleepy one is a little slower about it
const AWAKE_LID = 0.15;

// How often each beat comes up in each mood. The first beat of a mood is
// always its transition: "startle" when disturbed, "settle" when calming down.
const WEIGHTS: Record<Mood, [BeatName, number][]> = {
  drowsy: [
    ["doze", 3],
    ["drift", 2.5],
    ["sleep", 1],
  ],
  alert: [
    ["glance", 3],
    ["checkBehind", 2],
    ["sideEye", 1.5],
    ["blink", 1.5],
    ["stare", 1],
  ],
};

type Random = () => number;

/** The next beat in `mood`, starting from where `previous` left the eye. Never repeats `previous`. */
export function nextBeat(random: Random, previous: Beat | undefined, mood: Mood = "drowsy"): Beat {
  const from = previous?.steps.at(-1) ?? REST;
  let name: BeatName;
  if (mood === "alert" && previous?.mood !== "alert") name = "startle";
  else if (mood === "drowsy" && previous?.mood === "alert") name = "settle";
  else {
    const choices = WEIGHTS[mood].filter(([n]) => n !== previous?.name);
    let roll = random() * choices.reduce((sum, [, w]) => sum + w, 0);
    name = (choices.find(([, w]) => (roll -= w) < 0) ?? choices.at(-1)!)[0];
  }
  return { name, mood, steps: BEATS[name](random, from) };
}

const between = (random: Random, lo: number, hi: number) => lo + random() * (hi - lo);
const round = (n: number) => Math.round(n * 100) / 100;
const gaze = (s: EyeStep): Gaze => ({ x: s.x, y: s.y, lid: s.lid, pupil: s.pupil });
const side = (random: Random) => (random() < 0.5 ? -1 : 1);

// Each beat builds its steps from the gaze the previous beat ended on.
const BEATS: Record<BeatName, (random: Random, from: EyeStep) => EyeStep[]> = {
  // ---- Drowsy ----

  // The lid sinks, the pupil widens... then it drags itself half open again.
  doze(random, from) {
    const at = gaze(from);
    return [
      { ...at, lid: round(between(random, 0.8, 0.95)), pupil: 1.2, ms: between(random, 1800, 2600), hold: between(random, 600, 1400) },
      { ...at, lid: round(between(random, 0.45, 0.6)), pupil: 1, ms: between(random, 900, 1400), hold: between(random, 800, 1800) },
    ];
  },

  // A lazy look one way, then the other, then back.
  drift(random, from) {
    const first = side(random);
    const at = { ...gaze(from), lid: round(between(random, 0.45, 0.6)), pupil: 1.05 };
    const y = () => round(between(random, 0, MAX_Y));
    return [
      { ...at, x: round(first * between(random, 7, 12)), y: y(), ms: LAZY, hold: between(random, 900, 1600) },
      { ...at, x: round(-first * between(random, 7, 12)), y: y(), ms: LAZY, hold: between(random, 900, 1600) },
      { ...at, x: 0, y: 0, ms: LAZY, hold: between(random, 500, 900) },
    ];
  },

  // Nods right off for a moment, then cracks the lid open.
  sleep(random, from) {
    const at = gaze(from);
    return [
      { ...at, lid: 1, pupil: 1.2, ms: between(random, 1800, 2400), hold: between(random, 1200, 2400) },
      { ...at, lid: round(between(random, 0.6, 0.7)), pupil: 1.1, ms: between(random, 1100, 1500), hold: between(random, 700, 1200) },
    ];
  },

  // Nothing's there after all. Looks back to the front and lets the lids grow heavy.
  settle(random, from) {
    const at = { ...gaze(from), x: 0, y: 0 };
    return [
      { ...at, lid: REST_LID, pupil: 1, ms: SACCADE, hold: between(random, 600, 1000) },
      { ...at, lid: 0.55, pupil: 1.05, ms: 1500, hold: between(random, 600, 1000) },
    ];
  },

  // ---- Alert ----

  // Something disturbed it but it doesn't know where: jolts awake, staring ahead.
  startle: (random, from) => startle(random, from, from).steps,

  // Freezes, wide-eyed, and watches.
  stare(random, from) {
    const at = { ...gaze(from), lid: AWAKE_LID - 0.05 };
    return [
      { ...at, pupil: 0.8, ms: 150, hold: between(random, 700, 1100) },
      { ...at, pupil: 0.65, ms: 300, hold: between(random, 700, 1300) },
    ];
  },

  // Darts to one to three spots, as if something moved.
  glance(random, from) {
    const steps: EyeStep[] = [];
    for (let i = 0, n = Math.floor(between(random, 1, 4)); i < n; i++) {
      const x = round(between(random, -MAX_X, MAX_X));
      const y = round(between(random, -MAX_Y, MAX_Y));
      steps.push({ ...gaze(from), x, y, lid: AWAKE_LID, pupil: 0.75, ms: SACCADE, hold: between(random, 250, 700) });
    }
    return steps;
  },

  // Hard left, hard right, back: is someone there?
  checkBehind(random, from) {
    const s = side(random);
    const base = { ...gaze(from), y: 0, lid: AWAKE_LID, pupil: 0.7 };
    return [
      { ...base, x: s * MAX_X, ms: SACCADE, hold: between(random, 400, 800) },
      { ...base, x: -s * MAX_X, ms: SACCADE, hold: between(random, 400, 800) },
      { ...base, x: 0, ms: SACCADE, hold: 300 },
    ];
  },

  // Slides its eyes to one side and narrows them, watching you. Holds it too long.
  sideEye(random, from) {
    const at = { ...gaze(from), x: side(random) * MAX_X, y: 1, pupil: 0.8 };
    return [
      { ...at, lid: AWAKE_LID, ms: SACCADE, hold: 150 },
      { ...at, lid: 0.55, ms: 400, hold: between(random, 1200, 2000) },
      { ...at, x: 0, y: 0, lid: AWAKE_LID, ms: SACCADE, hold: 300 },
    ];
  },

  // A quick nervous blink where it's looking, sometimes two in a row.
  blink(random, from) {
    const open = { ...gaze(from), lid: AWAKE_LID };
    const once = (): EyeStep[] => [
      { ...open, lid: 1, ms: 70, hold: between(random, 50, 90) },
      { ...open, ms: 100, hold: between(random, 120, 350) },
    ];
    return random() < 0.4 ? [...once(), ...once()] : once();
  },
};

/**
 * The eye's reaction to a mouse move or touch: it jolts wide awake, pupil
 * pinned, and stares at `look` (see lookToward) before it starts looking around.
 */
export function startle(random: Random, from: EyeStep, look: { x: number; y: number }): Beat {
  const at = { ...gaze(from), x: look.x, y: look.y };
  return {
    name: "startle",
    mood: "alert",
    steps: [
      { ...at, lid: 0, pupil: 0.55, ms: 50, hold: between(random, 700, 1000) },
      { ...at, lid: AWAKE_LID, pupil: 0.7, ms: 200, hold: 100 },
    ],
  };
}

// How far away (in CSS px) something has to be for the eye to look all the way over.
const REACH = 250;

/** The gaze that looks toward a point `dx`, `dy` CSS px from the eye's centre. */
export function lookToward(dx: number, dy: number): { x: number; y: number } {
  const toward = (d: number, max: number) => round(Math.max(-1, Math.min(1, d / REACH)) * max) || 0;
  return { x: toward(dx, MAX_X), y: toward(dy, MAX_Y) };
}

// The lids hinge at the eye's corners (4,38) and (96,38). Each lid edge is a
// curve between the corners whose sag is set by `lid`, so the middle closes
// as the edges do, the way real lids flatten as they shut.
const OPEN_TOP = -8; // control-point y of the eye's upper rim
const OPEN_BOTTOM = 84; // and of its lower rim
const SHUT = 66; // where both lids meet: a gentle downward curve

const edge = (c: number) => `M4 38C20 ${c} 80 ${c} 96 38`;

/** SVG paths for the top and bottom lid edges at `lid` (0 open .. 1 shut). */
export function lidEdges(lid: number): { top: string; bottom: string } {
  const at = (open: number) => Math.round((open + (SHUT - open) * lid) * 100) / 100;
  return { top: edge(at(OPEN_TOP)), bottom: edge(at(OPEN_BOTTOM)) };
}
