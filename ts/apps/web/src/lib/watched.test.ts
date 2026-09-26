import { describe, expect, it } from "vitest";
import { loadWatched, saveWatched } from "./watched";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  };
}

describe("watched storage", () => {
  it("round-trips the watched movie IDs", () => {
    const storage = memoryStorage();
    saveWatched(["2025-01", "2025-04"], storage);
    expect(loadWatched(storage)).toEqual(["2025-01", "2025-04"]);
  });

  it("ignores missing or corrupt data", () => {
    expect(loadWatched(memoryStorage())).toEqual([]);
    expect(loadWatched(memoryStorage({ watched_movies: "{nope" }))).toEqual([]);
    expect(loadWatched(memoryStorage({ watched_movies: '["2025-01", 7]' }))).toEqual(["2025-01"]);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadWatched(broken)).toEqual([]);
    expect(() => saveWatched(["x"], broken)).not.toThrow();
  });
});
