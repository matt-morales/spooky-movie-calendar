import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseScene } from "../HouseScene";
import { DOOR, groundY } from "../scene";
import { BEATS, ZOMBIES, frameAt, siege } from "./siege";

const scene = (t: number) => render(<HouseScene story={siege} frame={frameAt(t)} />).container;
const zombie = (t: number, id: number) => frameAt(t).zombies.find((z) => z.id === id);
const intactBoards = (t: number) => frameAt(t).boards.filter((b) => b.up === 1 && b.fall === 0);
const HOUSE = { left: 176, right: 276 };

describe("siege", () => {
  it("opens like run-for-it: he runs in and shuts the door", () => {
    expect(frameAt(0).figure).toBeNull();
    expect(frameAt(BEATS.runInFrom + 0.5).figure).toMatchObject({ pose: "run", facing: 1 });
    expect(frameAt(BEATS.runInEnd).figure!.x).toBeCloseTo(DOOR.x);
    expect(frameAt(BEATS.closedAt).door).toBe(0);
    expect(frameAt(BEATS.closedAt).figure).toBeNull();
  });

  it("has ten zombies, all a bit different", () => {
    expect(ZOMBIES).toHaveLength(10);
    const kinds = new Set(ZOMBIES.map((z) => z.kind));
    expect(kinds).toEqual(new Set(["armsOut", "oneArm", "dragLeg", "crawler", "hunched"]));
    const looks = new Set(ZOMBIES.map((z) => `${z.kind}/${z.scale}/${z.from}`));
    expect(looks.size).toBe(10);
  });

  it("raises each zombie up from behind the horizon", () => {
    for (const z of ZOMBIES) {
      const emerging = zombie(z.appear + 0.05, z.id)!;
      expect(emerging.y, `zombie ${z.id}`).toBeGreaterThan(groundY(emerging.x) + 5); // still below the horizon
      const up = zombie(z.appear + BEATS.riseFor + 0.1, z.id)!;
      expect(up.y, `zombie ${z.id}`).toBeCloseTo(groundY(up.x), 1);
      expect(zombie(z.appear - 0.05, z.id), `zombie ${z.id}`).toBeUndefined();
    }
  });

  it("shambles slowly to the house, arriving before the boards give way", () => {
    for (const z of ZOMBIES) {
      const start = zombie(z.appear + BEATS.riseFor, z.id)!;
      const there = zombie(BEATS.breakFrom, z.id)!;
      expect(there.x, `zombie ${z.id}`).toBeGreaterThanOrEqual(HOUSE.left - 10);
      expect(there.x, `zombie ${z.id}`).toBeLessThanOrEqual(HOUSE.right);
      const speed = Math.abs(there.x - start.x) / (z.arrive - z.appear - BEATS.riseFor);
      expect(speed, `zombie ${z.id}`).toBeLessThan(40); // he ran at ~100
      expect(z.arrive, `zombie ${z.id}`).toBeLessThanOrEqual(BEATS.breakFrom);
    }
  });

  it("has him board up the three lower windows, two planks each", () => {
    expect(frameAt(BEATS.boardFrom + 0.5).builder).toMatchObject({ window: "left" });
    expect(frameAt(BEATS.boardFrom + 2.5).builder).toMatchObject({ window: "right" });
    expect(frameAt(BEATS.boardFrom + 4.5).builder).toMatchObject({ window: "wing" });
    const boarded = intactBoards(BEATS.boardedAt);
    expect(boarded).toHaveLength(6);
    for (const w of ["left", "right", "wing"]) expect(boarded.filter((b) => b.window === w)).toHaveLength(2);
    expect(frameAt(BEATS.boardedAt + 0.5).builder).toBeNull(); // he's retreated inside
  });

  it("lets the zombies break the boards, then batter the door open", () => {
    expect(intactBoards(BEATS.breakFrom - 0.1)).toHaveLength(6);
    expect(frameAt(BEATS.breakFrom + 0.3).boards.some((b) => b.fall > 0 && b.fall < 1)).toBe(true);
    expect(frameAt(BEATS.breakTo + 0.05).boards).toHaveLength(0);

    expect(frameAt(BEATS.rattleFrom - 0.05).door).toBe(0);
    const rattling = [0.1, 0.3, 0.5, 0.7, 0.9, 1.1].map((dt) => frameAt(BEATS.rattleFrom + dt).door);
    expect(Math.max(...rattling)).toBeGreaterThan(0); // it jolts...
    expect(Math.max(...rattling)).toBeLessThan(0.3); // ...but holds
    expect(frameAt(BEATS.burstAt + 0.3).door).toBe(1);
  });

  it("sends them all in through the door", () => {
    expect(frameAt(BEATS.burstAt).zombies).toHaveLength(10);
    expect(frameAt(BEATS.enterFrom + 1.5).zombies.length).toBeLessThan(10);
    // Each one fades out in the doorway as it goes in.
    const times = Array.from({ length: 60 }, (_, i) => BEATS.enterFrom + i * 0.1);
    const fadingInDoorway = times.flatMap((t) => frameAt(t).zombies).filter((z) => z.opacity < 1);
    expect(new Set(fadingInDoorway.map((z) => z.id)).size).toBe(10);
    for (const z of fadingInDoorway) expect(Math.abs(z.x - DOOR.x)).toBeLessThan(2);
    expect(frameAt(BEATS.allInside).zombies).toHaveLength(0);
  });

  it("ends with him sinking below a window among them", () => {
    expect(frameAt(BEATS.finaleFrom - 0.1).finale).toBeNull();
    expect(frameAt(BEATS.finaleFrom + 1).finale).toMatchObject({ rise: 1, sink: 0 });
    expect(frameAt(BEATS.finaleTo - 0.1).finale!.sink).toBeGreaterThan(0.8);
    expect(frameAt(BEATS.finaleTo + 0.1).finale).toBeNull();
  });
});

describe("drawing siege", () => {
  it("draws the zombies above the horizon only, so they rise from behind it", () => {
    const horde = scene(BEATS.breakFrom).querySelector("[data-part=horde]")!;
    expect(horde.getAttribute("clip-path")).toBe("url(#sb-above-horizon)");
    const kinds = [...horde.querySelectorAll("[data-part=zombie]")].map((z) => z.getAttribute("data-kind"));
    expect(kinds).toHaveLength(10);
    expect(new Set(kinds).size).toBe(5);
  });

  it("draws crawlers low to the ground", () => {
    const crawler = scene(BEATS.breakFrom).querySelector("[data-part=zombie][data-kind=crawler] circle")!;
    expect(Number(crawler.getAttribute("cy"))).toBeGreaterThan(-7);
  });

  it("draws him and his planks inside the windows", () => {
    const c = scene(BEATS.boardFrom + 1.4);
    expect(c.querySelector("[data-part=builder]")!.getAttribute("clip-path")).toBe("url(#sb-window-left)");
    expect(c.querySelectorAll("[data-part=board]").length).toBeGreaterThan(0);
    expect(scene(BEATS.boardedAt).querySelectorAll("[data-part=board]")).toHaveLength(6);
  });

  it("shows him in the window with zombies at the end", () => {
    const finale = scene(BEATS.finaleFrom + 1).querySelector("[data-part=finale]")!;
    expect(finale.querySelectorAll("circle").length).toBeGreaterThanOrEqual(3); // his head and theirs
  });
});
