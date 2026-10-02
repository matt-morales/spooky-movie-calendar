import { describe, expect, it } from "vitest";
import type { Movie } from "./api";
import { missingTapeLine, nightsOf } from "./nights";

const movie = (day: number): Movie => ({
  id: `2026-${String(day).padStart(2, "0")}`,
  year: 2026,
  day,
  date: `2026-10-${String(day).padStart(2, "0")}`,
  title: `Night ${day}`,
  directors: [],
  description: "",
  posterUrl: "",
  rating: { average: 0, count: 0, mine: null },
  reviewCount: 0,
});

describe("nightsOf", () => {
  it("has a night for every day of the month, with the movie where there is one", () => {
    const nights = nightsOf([movie(1), movie(2), movie(26)]);

    expect(nights).toHaveLength(31);
    expect(nights.map((n) => n.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(nights[0]!.movie?.title).toBe("Night 1");
    expect(nights[25]!.movie?.title).toBe("Night 26");
    expect(nights[2]).toEqual({ day: 3, date: "2026-10-03", movie: null });
    expect(nights[30]).toEqual({ day: 31, date: "2026-10-31", movie: null });
  });

  it("is empty until the lineup has loaded", () => {
    expect(nightsOf([])).toEqual([]);
  });
});

describe("missingTapeLine", () => {
  it("alternates between the two lines, night by night", () => {
    expect(missingTapeLine(27)).toBe("Tape 27: footage unrecovered.");
    expect(missingTapeLine(28)).toBe("The tape is blank. For now.");
    expect(missingTapeLine(29)).toBe("Tape 29: footage unrecovered.");
    expect(missingTapeLine(30)).toBe("The tape is blank. For now.");
  });
});
