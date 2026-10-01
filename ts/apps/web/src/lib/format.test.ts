import { describe, expect, it } from "vitest";
import { calendarDate, dropsLabel, letterboxdLink, localIsoDate, monthLabel, nightLabel, outOfFive } from "./format";

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

describe("dropsLabel", () => {
  it("names a 1–10 rating in drops, with halves", () => {
    expect(dropsLabel(1)).toBe("½ drop");
    expect(dropsLabel(2)).toBe("1 drop");
    expect(dropsLabel(7)).toBe("3½ drops");
    expect(dropsLabel(10)).toBe("5 drops");
  });
});

describe("calendarDate", () => {
  it("splits a date into a short month and a two-digit day", () => {
    expect(calendarDate("2025-10-01")).toEqual({ month: "Oct", day: "01" });
    expect(calendarDate("2025-10-31")).toEqual({ month: "Oct", day: "31" });
  });
});

describe("outOfFive", () => {
  it("turns a 1–10 average into drops out of five, dropping a trailing .0", () => {
    expect(outOfFive(8)).toBe("4");
    expect(outOfFive(7)).toBe("3.5");
    expect(outOfFive(6.666)).toBe("3.3");
  });
});

describe("localIsoDate", () => {
  it("formats the local calendar day", () => {
    expect(localIsoDate(new Date(2025, 9, 7, 23, 30))).toBe("2025-10-07");
  });
});

describe("letterboxdLink", () => {
  it("prefers the film's own page", () => {
    expect(letterboxdLink({ title: "Christine", letterboxdUrl: "https://letterboxd.com/film/christine/" })).toBe(
      "https://letterboxd.com/film/christine/",
    );
  });
  it("falls back to a search", () => {
    expect(letterboxdLink({ title: "The Grudge" })).toBe("https://letterboxd.com/search/films/The%20Grudge/");
  });
});
