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
