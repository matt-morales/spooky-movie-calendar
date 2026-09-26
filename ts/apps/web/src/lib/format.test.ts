import { describe, expect, it } from "vitest";
import { averageDrops, monthLabel, nightLabel } from "./format";

describe("nightLabel", () => {
  it.each([
    ["2025-10-01", "October 1st"],
    ["2025-10-02", "October 2nd"],
    ["2025-10-03", "October 3rd"],
    ["2025-10-09", "October 9th"],
    ["2025-10-11", "October 11th"],
    ["2025-10-12", "October 12th"],
    ["2025-10-13", "October 13th"],
    ["2025-10-21", "October 21st"],
    ["2025-10-22", "October 22nd"],
    ["2025-10-23", "October 23rd"],
    ["2025-10-31", "October 31st"],
  ])("%s → %s", (iso, want) => {
    expect(nightLabel(iso)).toBe(want);
  });
});

describe("monthLabel", () => {
  it("uses the first movie's month and year", () => {
    expect(monthLabel([{ date: "2025-10-01" }, { date: "2025-10-02" }])).toBe("October 2025");
  });
  it("is empty with no movies", () => {
    expect(monthLabel([])).toBe("");
  });
});

describe("averageDrops", () => {
  it("converts the 2–10 scale to drops with one decimal", () => {
    expect(averageDrops(7)).toBe("3.5");
    expect(averageDrops(8)).toBe("4.0");
    expect(averageDrops(6.666)).toBe("3.3");
  });
});
