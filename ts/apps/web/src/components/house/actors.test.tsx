import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StickFigure, runAcross, standAt, walkAcross, type FigureFrame } from "./actors";
import { groundY } from "./scene";

const draw = (figure: FigureFrame) => render(<svg><StickFigure figure={figure} /></svg>).container;

// Endpoints of every line segment in the figure's paths, in figure coordinates.
function segments(container: HTMLElement) {
  const out: Array<[number, number, number, number]> = [];
  for (const p of container.querySelectorAll("[data-part=figure] path")) {
    const nums = [...p.getAttribute("d")!.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
    for (let i = 0; i + 3 < nums.length; i += 4) out.push([nums[i]!, nums[i + 1]!, nums[i + 2]!, nums[i + 3]!]);
  }
  return out;
}

describe("walkAcross", () => {
  it("walks along the ground, more slowly than running", () => {
    const walk = walkAcross(1, 0, 4, 200, 100);
    expect(walk).toMatchObject({ pose: "walk", facing: -1 });
    expect(walk.y).toBeCloseTo(groundY(walk.x));
    // A walking stride changes more gently between frames than a running one.
    const walkStep = Math.abs(walkAcross(1.05, 0, 4, 200, 100).stride - walk.stride);
    const runStep = Math.abs(runAcross(1.05, 0, 4, 200, 100).stride - runAcross(1, 0, 4, 200, 100).stride);
    expect(walkStep).toBeLessThan(runStep);
  });
});

describe("StickFigure", () => {
  it("labels its pose", () => {
    expect(draw(standAt(100, "lookUp", 1)).querySelector("[data-part=figure]")).toHaveAttribute("data-pose", "lookUp");
  });

  it("tilts its head back to look up", () => {
    const up = draw(standAt(100, "lookUp", 1)).querySelector("circle")!;
    const ahead = draw(standAt(100, "stand", 1)).querySelector("circle")!;
    expect(Number(up.getAttribute("cy"))).toBeLessThan(Number(ahead.getAttribute("cy")));
  });

  it("hangs horizontally from its middle when carried, arms and legs dangling", () => {
    const carried: FigureFrame = { x: 100, y: 250, facing: 1, pose: "carried", stride: 0, tilt: 1 };
    const c = draw(carried);
    const [torso, ...limbs] = segments(c);
    // Torso runs level (horizontal)...
    expect(Math.abs(torso![1] - torso![3])).toBeLessThan(0.5);
    // ...and every arm and leg hangs down from it.
    expect(limbs.length).toBe(4);
    for (const [, y1, , y2] of limbs) expect(y2).toBeGreaterThan(y1 + 3);
  });
});
