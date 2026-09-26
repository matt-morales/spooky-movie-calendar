import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseScene } from "../HouseScene";
import { STORIES } from ".";

// Frames compared with a tolerance for floating-point noise (e.g. 25.3 % 25
// is 0.3000000000000007).
function expectSameFrame(a: unknown, b: unknown, path = "frame"): void {
  if (typeof a === "number" && typeof b === "number") {
    expect(Math.abs(a - b), path).toBeLessThan(1e-9);
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expectSameFrame((a as never)[k], (b as never)[k], `${path}.${k}`);
  } else {
    expect(a, path).toEqual(b);
  }
}

// Every story plugged into the house must follow these rules, so any of them
// can be picked at random and the loop (and reduced-motion view) is seamless.

describe("house stories", () => {
  it("have unique ids", () => {
    const ids = STORIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  describe.each(STORIES.map((s) => [s.id, s] as const))("%s", (_id, story) => {
    it("loops", () => {
      expect(story.loop).toBeGreaterThan(0);
      for (const t of [0.3, 2.7, story.loop / 2]) {
        expectSameFrame(story.frameAt(t + story.loop), story.frameAt(t));
      }
    });

    it("begins and ends with the house as drawn, door open", () => {
      expect(story.still.door).toBe(1);
      expect(story.frameAt(0).door).toBe(1);
      expect(story.frameAt(story.loop - 0.01)).toEqual(story.still);
    });

    it("is a pure function of time", () => {
      expect(story.frameAt(5)).toEqual(story.frameAt(5));
    });

    it("draws nothing extra when still", () => {
      const { container } = render(<HouseScene story={story} frame={story.still} />);
      expect(container.querySelector("[data-layer=inside]")!.childElementCount).toBe(0);
      expect(container.querySelector("[data-layer=outside]")!.childElementCount).toBe(0);
    });
  });
});
