import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseScene } from "../HouseScene";
import { DOOR, WING, groundY } from "../scene";
import { BEATS, HOVER, abduction, frameAt } from "./abduction";

const scene = (t: number) => render(<HouseScene story={abduction} frame={frameAt(t)} />).container;
const HOUSE_LEFT = 176;

describe("abduction", () => {
  it("opens on someone watching TV in the wing window, door shut", () => {
    const f = frameAt(3);
    expect(f.door).toBe(0);
    expect(f.tv).toBeGreaterThan(0.5);
    expect(f.watcher).not.toBeNull();
    expect(f.figure).toBeNull();
  });

  it("flies a UFO in from the left to hover beside the house", () => {
    expect(frameAt(BEATS.ufoIn).ufo!.x).toBeLessThan(0);
    const hovering = frameAt(BEATS.ufoArrives + 1).ufo!;
    expect(hovering.x).toBeCloseTo(HOVER.x, 0);
    expect(hovering.x).toBeLessThan(HOUSE_LEFT); // to the left of the house
    // The lights on the bottom half keep turning.
    expect(frameAt(6).ufo!.spin).not.toBeCloseTo(frameAt(6.2).ufo!.spin);
  });

  it("turns the TV off, then leaves the window", () => {
    expect(frameAt(BEATS.tvOff - 0.2).tv).toBeGreaterThan(0);
    expect(frameAt(BEATS.tvOff + 0.3).tv).toBe(0);
    expect(frameAt(BEATS.tvOff + 0.3).watcher).not.toBeNull(); // still sitting a moment
    expect(frameAt(BEATS.leftWindow + 0.1).watcher).toBeNull();
  });

  it("opens the door and looks left, then right", () => {
    expect(frameAt(BEATS.doorOpen).door).toBe(1);
    expect(frameAt(BEATS.doorOpen).figure!.x).toBeCloseTo(DOOR.x);
    expect(frameAt(BEATS.lookLeft + 0.3).figure).toMatchObject({ pose: "look", facing: -1 });
    expect(frameAt(BEATS.lookRight + 0.3).figure).toMatchObject({ pose: "look", facing: 1 });
  });

  it("walks out to stand under the UFO", () => {
    const mid = frameAt((BEATS.walkFrom + BEATS.walkTo) / 2).figure!;
    expect(mid).toMatchObject({ pose: "walk", facing: -1 });
    expect(mid.x).toBeLessThan(DOOR.x);
    expect(mid.x).toBeGreaterThan(HOVER.x);
    expect(mid.y).toBeCloseTo(groundY(mid.x));
    expect(frameAt(BEATS.walkTo).figure!.x).toBeCloseTo(HOVER.x);
  });

  it("looks up, and a beam shines down on him", () => {
    expect(frameAt(BEATS.walkTo - 0.1).beam).toBe(0);
    expect(frameAt(BEATS.lookUp + 0.2).figure!.pose).toBe("lookUp");
    expect(frameAt(BEATS.liftFrom + 0.1).beam).toBeGreaterThan(0.5);
  });

  it("carries him up horizontally, hanging from his middle, into the UFO", () => {
    const early = frameAt(BEATS.liftFrom + 0.8).figure!;
    const later = frameAt((BEATS.liftFrom + BEATS.liftTo) / 2 + 1).figure!;
    expect(early.pose).toBe("carried");
    expect(later.tilt).toBe(1); // horizontal
    expect(later.y).toBeLessThan(early.y); // rising
    expect(frameAt(BEATS.liftTo + 0.1).figure).toBeNull(); // taken inside
  });

  it("switches the beam off and flies away", () => {
    expect(frameAt(BEATS.flyOff).beam).toBe(0);
    const leaving = frameAt(BEATS.flyOff + 1).ufo!;
    expect(leaving.y).toBeLessThan(HOVER.y);
    expect(leaving.scale).toBeLessThan(1); // into the distance
    expect(frameAt(BEATS.flyOffEnd + 0.1).ufo).toBeNull();
  });

  it("lets the door he left open swing shut by itself", () => {
    expect(frameAt(BEATS.flyOffEnd + 0.1).door).toBe(1);
    expect(frameAt(abduction.loop - 0.01).door).toBe(0);
  });
});

describe("drawing abduction", () => {
  it("lights the wing window with the TV and keeps the watcher inside it", () => {
    const c = scene(3);
    expect(Number(c.querySelector("[data-part=tv]")!.getAttribute("opacity"))).toBeGreaterThan(0.3);
    expect(c.querySelector("[data-part=watcher]")!.getAttribute("clip-path")).toBe("url(#sb-wing)");
    expect(c.querySelector("#sb-wing rect")).toHaveAttribute("x", String(WING.x));
  });

  it("draws a UFO with an alien in the dome and coloured lights on its spinning half", () => {
    const c = scene(BEATS.ufoArrives + 1);
    expect(c.querySelector("[data-part=ufo] [data-part=alien]")).not.toBeNull();
    const lights = [...c.querySelectorAll("[data-part=ufo-lights] circle")];
    const colours = new Set(lights.map((l) => l.getAttribute("fill")));
    expect(colours.size).toBeGreaterThanOrEqual(4); // white, green, blue, red
  });

  it("draws the beam only while it shines", () => {
    expect(scene(BEATS.walkTo - 0.1).querySelector("[data-part=beam]")).toBeNull();
    expect(scene(BEATS.liftFrom + 0.5).querySelector("[data-part=beam]")).not.toBeNull();
  });

  it("draws him limp and horizontal while he's carried", () => {
    const figure = scene((BEATS.liftFrom + BEATS.liftTo) / 2).querySelector("[data-part=figure]")!;
    expect(figure.getAttribute("data-pose")).toBe("carried");
  });
});
