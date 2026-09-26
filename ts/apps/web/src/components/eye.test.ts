import { describe, expect, it } from "vitest";
import { MAX_X, MAX_Y, REST, REST_LID, lidEdges, lookToward, nextBeat, startle, type Beat, type Mood } from "./eye";

// A seeded random so failures are reproducible.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// Plays beats back to back in the given moods, as the title's eye does.
function play(moods: Mood[], seed = 1): Beat[] {
  const random = seeded(seed);
  const beats: Beat[] = [];
  for (const mood of moods) beats.push(nextBeat(random, beats.at(-1), mood));
  return beats;
}

const repeat = (mood: Mood, n: number): Mood[] => Array(n).fill(mood);
const duration = (b: Beat) => b.steps.reduce((t, s) => t + s.ms + s.hold, 0);

// Long runs of each mood, switching back and forth.
const moods: Mood[] = Array.from({ length: 40 }, (_, i) => repeat(i % 2 ? "alert" : "drowsy", 12)).flat();
const beats = play(moods);
const steps = beats.flatMap((b) => b.steps);
const drowsy = beats.filter((b) => b.mood === "drowsy");
const alert = beats.filter((b) => b.mood === "alert");

describe("nextBeat", () => {
  it("keeps the iris inside the eye and the lids and pupil in range", () => {
    for (const s of steps) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(MAX_X);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(MAX_Y);
      expect(s.lid).toBeGreaterThanOrEqual(0);
      expect(s.lid).toBeLessThanOrEqual(1);
      expect(s.pupil).toBeGreaterThan(0.5);
      expect(s.pupil).toBeLessThan(1.5);
      expect(s.ms).toBeGreaterThanOrEqual(0);
      expect(s.hold).toBeGreaterThan(0);
    }
  });

  it("plays the mood it's asked for", () => {
    beats.forEach((b, i) => expect(b.mood).toBe(moods[i]));
  });

  it("is erratic: never does the same thing twice in a row", () => {
    for (let i = 1; i < beats.length; i++) expect(beats[i]!.name).not.toBe(beats[i - 1]!.name);
  });

  it("moves its gaze in jumps like a real eye, never a slow glide", () => {
    let prev = steps[0]!;
    for (const s of steps) {
      if (s.x !== prev.x || s.y !== prev.y) expect(s.ms).toBeLessThanOrEqual(200);
      prev = s;
    }
  });

  it("carries on from where the previous beat left the gaze", () => {
    for (let i = 1; i < beats.length; i++) {
      const last = beats[i - 1]!.steps.at(-1)!;
      if (["doze", "sleep"].includes(beats[i]!.name)) expect(beats[i]!.steps[0]).toMatchObject({ x: last.x, y: last.y });
    }
  });

  it("is deterministic for a given random source", () => {
    expect(play(moods.slice(0, 30), 7)).toEqual(play(moods.slice(0, 30), 7));
    expect(play(moods.slice(0, 30), 7)).not.toEqual(play(moods.slice(0, 30), 8));
  });
});

describe("drowsy", () => {
  it("dozes, drifts its gaze left and right, and sometimes falls asleep", () => {
    const names = new Set(drowsy.filter((b) => b.name !== "settle").map((b) => b.name));
    expect([...names].sort()).toEqual(["doze", "drift", "sleep"]);
  });

  it("keeps its lids heavy", () => {
    for (const b of drowsy) for (const s of b.steps.slice(1)) expect(s.lid).toBeGreaterThanOrEqual(REST_LID);
  });

  it("drifts off and wakes slowly: big lid moves take their time", () => {
    for (const b of drowsy) {
      let lid = b.steps[0]!.lid;
      for (const s of b.steps.slice(1)) {
        if (Math.abs(s.lid - lid) > 0.2) expect(s.ms).toBeGreaterThanOrEqual(800);
        lid = s.lid;
      }
    }
  });

  it("looks both ways when it drifts", () => {
    for (const b of drowsy.filter((b) => b.name === "drift")) {
      const xs = b.steps.map((s) => s.x);
      expect(Math.min(...xs)).toBeLessThan(0);
      expect(Math.max(...xs)).toBeGreaterThan(0);
    }
  });

  it("never falls asleep for good: every beat ends with the eye cracked open", () => {
    for (const b of drowsy) expect(b.steps.at(-1)!.lid).toBeLessThanOrEqual(0.7);
  });

  it("calms down slowly after a scare", () => {
    const settles = beats.filter((b, i) => b.mood === "drowsy" && beats[i - 1]?.mood === "alert");
    expect(settles.length).toBeGreaterThan(0);
    for (const b of settles) {
      expect(b.name).toBe("settle");
      expect(duration(b)).toBeGreaterThanOrEqual(1500);
    }
  });
});

describe("alert", () => {
  it("jolts awake when disturbed: wide open, pupil pinned, instantly", () => {
    const startles = beats.filter((b, i) => b.mood === "alert" && beats[i - 1]?.mood !== "alert");
    expect(startles.length).toBeGreaterThan(0);
    for (const b of startles) {
      expect(b.name).toBe("startle");
      expect(b.steps[0]).toMatchObject({ lid: 0 });
      expect(b.steps[0]!.pupil).toBeLessThan(0.8);
      expect(b.steps[0]!.ms).toBeLessThanOrEqual(80);
    }
  });

  it("then looks around, paranoid", () => {
    const names = new Set(alert.filter((b) => b.name !== "startle").map((b) => b.name));
    expect([...names].sort()).toEqual(["blink", "checkBehind", "glance", "sideEye", "stare"]);
  });

  it("darts its gaze with fast saccades", () => {
    let prev = alert[0]!.steps[0]!;
    for (const s of alert.flatMap((b) => b.steps)) {
      if (s.x !== prev.x || s.y !== prev.y) expect(s.ms).toBeLessThanOrEqual(80);
      prev = s;
    }
  });

  it("stays wide awake: ends every beat at least as open as resting", () => {
    for (const b of alert) expect(b.steps.at(-1)!.lid).toBeLessThanOrEqual(REST_LID);
  });

  it("blinks quickly: a fully closed lid snaps shut and is held only briefly", () => {
    const closed = alert.flatMap((b) => b.steps).filter((s) => s.lid === 1);
    expect(closed.length).toBeGreaterThan(0);
    for (const s of closed) {
      expect(s.ms).toBeLessThanOrEqual(100);
      expect(s.hold).toBeLessThanOrEqual(150);
    }
  });
});

describe("startle", () => {
  const random = seeded(3);
  const drowsyEye = { ...REST, x: -5, lid: 0.9, pupil: 1.2 };
  const alertEye = { ...REST, x: 8, lid: 0.15, pupil: 0.7 };

  it("snaps wide open with a pinned pupil, whatever state the eye was in", () => {
    for (const from of [drowsyEye, alertEye]) {
      const b = startle(random, from, { x: 10, y: -2 });
      expect(b).toMatchObject({ name: "startle", mood: "alert" });
      expect(b.steps[0]).toMatchObject({ lid: 0, x: 10, y: -2 });
      expect(b.steps[0]!.pupil).toBeLessThan(0.7);
      expect(b.steps[0]!.ms).toBeLessThanOrEqual(60);
    }
  });

  it("stares at where the movement was long enough to notice", () => {
    const b = startle(random, alertEye, { x: -14, y: 3 });
    expect(b.steps[0]!.hold).toBeGreaterThanOrEqual(600);
  });
});

describe("lookToward", () => {
  it("looks straight ahead at the eye itself", () => {
    expect(lookToward(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("looks toward a point, all the way over when it's far away", () => {
    expect(lookToward(2000, 0)).toEqual({ x: MAX_X, y: 0 });
    expect(lookToward(-2000, 2000)).toEqual({ x: -MAX_X, y: MAX_Y });
    expect(lookToward(0, -2000)).toEqual({ x: 0, y: -MAX_Y });
  });

  it("looks partway over for a nearby point", () => {
    const { x } = lookToward(60, 0);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(MAX_X);
  });
});

describe("lidEdges", () => {
  const LENS_TOP = "M4 38C20 -8 80 -8 96 38";
  const LENS_BOTTOM = "M4 38C20 84 80 84 96 38";

  it("rests on the rim of the eye when wide open", () => {
    expect(lidEdges(0)).toEqual({ top: LENS_TOP, bottom: LENS_BOTTOM });
  });

  it("meets in one line when shut", () => {
    const { top, bottom } = lidEdges(1);
    expect(top).toBe(bottom);
  });

  it("hinges at the corners, so the middle closes as fast as the edges", () => {
    for (const lid of [0, 0.3, 0.5, 0.8, 1]) {
      for (const edge of Object.values(lidEdges(lid))) {
        expect(edge.startsWith("M4 38C")).toBe(true);
        expect(edge.endsWith(" 96 38")).toBe(true);
      }
    }
  });

  it("closes steadily: the top lid only comes down and the bottom only goes up", () => {
    const middle = (edge: string) => Number(edge.split(" ")[2]);
    let prev = lidEdges(0);
    for (let lid = 0.1; lid <= 1; lid += 0.1) {
      const now = lidEdges(lid);
      expect(middle(now.top)).toBeGreaterThan(middle(prev.top));
      expect(middle(now.bottom)).toBeLessThan(middle(prev.bottom));
      prev = now;
    }
  });
});
