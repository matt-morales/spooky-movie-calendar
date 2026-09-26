import { describe, expect, it } from "vitest";
import type { AnyHouseStory } from "../scene";
import { STORIES, pickStory } from ".";

const story = (id: string) => ({ id, title: id, loop: 1, still: { door: 1 }, frameAt: () => ({ door: 1 }) }) as AnyHouseStory;
const choices = [story("a"), story("b"), story("c")];

describe("pickStory", () => {
  it("picks one at random", () => {
    expect(pickStory(choices, "", () => 0).id).toBe("a");
    expect(pickStory(choices, "", () => 0.5).id).toBe("b");
    expect(pickStory(choices, "", () => 0.999).id).toBe("c");
  });

  it("lets ?story=<id> choose one, for previewing", () => {
    expect(pickStory(choices, "?story=c", () => 0).id).toBe("c");
  });

  it("ignores an unknown ?story", () => {
    expect(pickStory(choices, "?story=nope", () => 0).id).toBe("a");
  });

  it("includes the original story", () => {
    expect(STORIES.map((s) => s.id)).toContain("run-for-it");
  });
});
