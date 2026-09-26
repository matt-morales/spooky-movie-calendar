import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseScene } from "../HouseScene";
import { ATTIC, DOOR, WINDOW, groundY } from "../scene";
import { STORY, frameAt, runForIt } from "./runForIt";

const storyAt = frameAt;
const scene = (t: number) => render(<HouseScene story={runForIt} frame={storyAt(t)} />).container;

// Times of each beat in the story, in seconds from the start of a loop.
const { runInEnd, closedAt, peekFrom, peekTo, openAt, lookLeftAt, lookRightAt, runOutFrom, runOutEnd, lurkFrom, lurkTo, loop } =
  STORY;

describe("storyAt", () => {
  it("starts with the figure off-screen to the left, running toward the house, door open", () => {
    const f = storyAt(0);
    expect(f.figure).toMatchObject({ pose: "run", facing: 1 });
    expect(f.figure!.x).toBeLessThan(0);
    expect(f.door).toBe(1);
  });

  it("runs along the ground to the door", () => {
    const mid = storyAt(runInEnd / 2).figure!;
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(DOOR.x);
    expect(mid.y).toBeCloseTo(groundY(mid.x));

    const arrived = storyAt(runInEnd).figure!;
    expect(arrived.x).toBeCloseTo(DOOR.x);
  });

  it("goes inside and closes the door", () => {
    expect(storyAt(closedAt).figure).toBeNull();
    expect(storyAt(closedAt).door).toBe(0);
    // The door swings shut gradually, not in one frame.
    const halfway = storyAt(closedAt - 0.2).door;
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
  });

  it("looks out of an upstairs window, turning its head", () => {
    expect(storyAt(peekFrom - 0.1).peek).toBeNull();
    const early = storyAt(peekFrom + 1).peek!;
    const late = storyAt(peekTo - 1).peek!;
    expect(early.rise).toBe(1);
    expect(early.look).not.toBe(late.look); // looks one way, then the other
    expect(storyAt(peekTo + 0.1).peek).toBeNull();
    // Nobody is outside while it's upstairs, and the door stays shut.
    expect(storyAt((peekFrom + peekTo) / 2).figure).toBeNull();
    expect(storyAt((peekFrom + peekTo) / 2).door).toBe(0);
  });

  it("comes back down, opens the door and looks left, then right", () => {
    expect(storyAt(openAt).door).toBe(1);
    const inDoorway = storyAt(openAt).figure!;
    expect(inDoorway.x).toBeCloseTo(DOOR.x);
    expect(inDoorway.pose).toBe("stand");

    expect(storyAt(lookLeftAt + 0.3).figure).toMatchObject({ pose: "look", facing: -1 });
    expect(storyAt(lookRightAt + 0.3).figure).toMatchObject({ pose: "look", facing: 1 });
  });

  it("runs out of the house and off-screen to the right", () => {
    const leaving = storyAt((runOutFrom + runOutEnd) / 2).figure!;
    expect(leaving).toMatchObject({ pose: "run", facing: 1 });
    expect(leaving.x).toBeGreaterThan(DOOR.x);
    expect(leaving.y).toBeCloseTo(groundY(leaving.x));
    expect(storyAt(runOutEnd).figure!.x).toBeGreaterThan(400);
  });

  it("then something rises into the attic window, raises a knife and heads downstairs", () => {
    expect(lurkFrom).toBeGreaterThan(runOutEnd); // only once the figure has fled
    expect(lurkTo).toBeLessThan(loop);
    expect(storyAt(lurkFrom - 0.05).lurker).toBeNull();
    expect(storyAt(lurkTo + 0.05).lurker).toBeNull();

    const at = (p: number) => storyAt(lurkFrom + (lurkTo - lurkFrom) * p).lurker!;
    // Rises slowly from below the sill...
    expect(at(0.01).rise).toBeLessThan(0.1);
    expect(at(0.35).rise).toBe(1);
    // ...its eyes light up and it raises the knife...
    expect(at(0.01).eyes).toBe(0);
    expect(at(0.6).eyes).toBe(1);
    expect(at(0.01).knife).toBe(0);
    expect(at(0.6).knife).toBe(1);
    // ...then slips out of view to the left.
    expect(at(0.6).exit).toBe(0);
    expect(at(0.99).exit).toBeGreaterThan(0.9);

    const scene = storyAt(lurkFrom + 1);
    expect(scene.figure).toBeNull();
    expect(scene.door).toBe(1);
    expect(ATTIC.width).toBeGreaterThan(0);
  });

  it("rests with the scene as drawn (door open, nobody around) until it loops", () => {
    const resting = storyAt(lurkTo + 0.5);
    expect(resting).toEqual({ figure: null, door: 1, peek: null, lurker: null });
    expect(storyAt(loop + 0.5)).toEqual(storyAt(0.5));
  });

  it("animates the legs while running but not while standing", () => {
    const a = storyAt(1).figure!.stride;
    const b = storyAt(1.1).figure!.stride;
    expect(a).not.toBeCloseTo(b);
    expect(storyAt(openAt).figure!.stride).toBe(0);
  });
});

describe("drawing run-for-it", () => {
  it("draws the stick figure where the story puts it", () => {
    const figure = scene(1).querySelector("[data-part=figure]")!;
    expect(figure).not.toBeNull();
    expect(figure.getAttribute("transform")).toMatch(/^translate\(/);
  });

  it("mirrors the figure when it faces left", () => {
    expect(scene(STORY.lookLeftAt + 0.3).querySelector("[data-part=figure]")!.getAttribute("transform")).toContain(
      "scale(-1",
    );
  });

  it("darkens the doorway when the door is shut", () => {
    expect(scene(STORY.closedAt).querySelector("[data-part=door-light]")).toHaveAttribute("width", "0");
  });

  it("moves the head into the left pane, then the right pane, as it looks out", () => {
    const head = (t: number) => Number(scene(t).querySelector("[data-part=peek] circle")!.getAttribute("cx"));
    const centre = WINDOW.x + WINDOW.width / 2; // where the vertical window bar is
    expect(head(STORY.peekFrom + 1)).toBeLessThan(centre - 2);
    expect(head(STORY.peekTo - 1)).toBeGreaterThan(centre + 2);
  });

  describe("the figure in the attic", () => {
    const lurking = (p: number) => scene(STORY.lurkFrom + (STORY.lurkTo - STORY.lurkFrom) * p);

    it("is only visible through the attic window", () => {
      const lurker = lurking(0.5).querySelector("[data-part=lurker]")!;
      expect(lurker.getAttribute("clip-path")).toBe("url(#sb-attic)");
      expect(ATTIC.width).toBeGreaterThan(0);
    });

    it("has glowing red eyes once it has risen", () => {
      expect(lurking(0.01).querySelector("[data-part=lurker-eyes]")).toHaveAttribute("opacity", "0");
      expect(lurking(0.6).querySelector("[data-part=lurker-eyes]")).toHaveAttribute("opacity", "1");
    });

    it("raises a knife above its head", () => {
      const tipY = (p: number) => {
        const d = lurking(p).querySelector("[data-part=knife]")!.getAttribute("d")!;
        return [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))[3]!;
      };
      expect(tipY(0.6)).toBeLessThan(tipY(0.01) - 4);
    });
  });
});
