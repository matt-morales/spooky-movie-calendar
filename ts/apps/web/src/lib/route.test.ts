import { describe, expect, it } from "vitest";
import { routeFor } from "./route";

const at = (pathname: string, search = "", hash = "") => routeFor({ pathname, search, hash }, 2026);

describe("routeFor", () => {
  it("reads the year from the path", () => {
    expect(at("/2025")).toEqual({ year: 2025, url: "/2025" });
    expect(at("/2026/")).toEqual({ year: 2026, url: "/2026" });
  });

  it("puts the default year in the path when there isn't one", () => {
    expect(at("/")).toEqual({ year: 2026, url: "/2026" });
  });

  it("keeps old ?year= links working", () => {
    expect(at("/", "?year=2025")).toEqual({ year: 2025, url: "/2025" });
  });

  it("keeps the night in the hash", () => {
    expect(at("/", "", "#movie-12")).toEqual({ year: 2026, url: "/2026#movie-12" });
    expect(at("/2025", "", "#movie-3")).toEqual({ year: 2025, url: "/2025#movie-3" });
  });

  it("falls back to the default year for anything else", () => {
    expect(at("/nope")).toEqual({ year: 2026, url: "/2026" });
    expect(at("/1999")).toEqual({ year: 2026, url: "/2026" });
    expect(at("/", "?year=abc")).toEqual({ year: 2026, url: "/2026" });
  });
});
