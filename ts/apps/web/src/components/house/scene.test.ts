import { describe, expect, it } from "vitest";
import { DOOR, groundY } from "./scene";

describe("groundY", () => {
  it("follows the drawn ground line", () => {
    expect(groundY(0)).toBeCloseTo(296, 0);
    expect(groundY(DOOR.x)).toBeGreaterThan(288);
    expect(groundY(DOOR.x)).toBeLessThan(292);
    expect(groundY(400)).toBeCloseTo(286, 0);
  });
});

describe("the windows", () => {
  it("names the three lower windows, left to right", async () => {
    const { LOWER_WINDOWS } = await import("./scene");
    expect(LOWER_WINDOWS.map((w) => w.id)).toEqual(["left", "right", "wing"]);
    expect(LOWER_WINDOWS[0]!.x).toBeLessThan(LOWER_WINDOWS[1]!.x);
    expect(LOWER_WINDOWS[1]!.x).toBeLessThan(LOWER_WINDOWS[2]!.x);
  });
});
