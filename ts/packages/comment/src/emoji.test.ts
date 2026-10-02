import { beforeAll, describe, expect, it } from "vitest";
import { colonQuery, completeShortcode, loadEmoji, searchEmoji, type EmojiGroup } from "./emoji";

let groups: EmojiGroup[];
beforeAll(async () => {
  groups = await loadEmoji();
});

describe("loadEmoji", () => {
  it("has every group, and leaves out emoji too new for older phones", () => {
    expect(groups.map((g) => g.name)).toContain("Smileys & Emotion");
    const all = groups.flatMap((g) => g.emojis);
    expect(all.length).toBeGreaterThan(1500);
    expect(all.find((e) => e.emoji === "💀")).toMatchObject({ slug: "skull" });
    // 🫨 (shaking face) is Emoji 15: many phones still show it as a box.
    expect(all.find((e) => e.emoji === "🫨")).toBeUndefined();
  });

  it("loads once", async () => {
    expect(await loadEmoji()).toBe(groups);
  });
});

describe("searchEmoji", () => {
  const top = (q: string, n = 3) => searchEmoji(groups, q, n).map((e) => e.emoji);

  it("ranks whole names, then words starting with the query, then anywhere", () => {
    expect(top("scre", 1)).toEqual(["😱"]); // a face before the screwdriver
    expect(top("skull", 1)).toEqual(["💀"]);
    expect(top("ghost", 1)).toEqual(["👻"]);
    expect(top("scream")).toContain("😱"); // face_screaming_in_fear
    expect(top("fire", 1)).toEqual(["🔥"]);
  });

  it("ignores case, spaces and underscores, like Slack shortcodes", () => {
    expect(top("Thumbs Up", 1)).toEqual(["👍"]);
    expect(top("thumbs_up", 1)).toEqual(["👍"]);
    expect(top("thumbsup", 1)).toEqual(["👍"]);
  });

  it("returns nothing for no match and respects the limit", () => {
    expect(searchEmoji(groups, "zzzzzz", 8)).toEqual([]);
    expect(searchEmoji(groups, "face", 8)).toHaveLength(8);
  });
});

describe("colonQuery", () => {
  it("finds a :query right before the caret", () => {
    expect(colonQuery("so scary :sk", 12)).toEqual({ start: 9, query: "sk" });
    expect(colonQuery(":ghost", 6)).toEqual({ start: 0, query: "ghost" });
    expect(colonQuery("line\n:fi", 8)).toEqual({ start: 5, query: "fi" });
  });

  it("needs two characters, and a space or the start before the colon", () => {
    expect(colonQuery("so :s", 5)).toBeNull();
    expect(colonQuery("10:30", 5)).toBeNull(); // a time, not an emoji
    expect(colonQuery("http://x", 8)).toBeNull();
    expect(colonQuery("so :sk ull", 10)).toBeNull(); // caret is past a space
  });
});

describe("completeShortcode", () => {
  it("turns a typed :name: into its emoji", () => {
    expect(completeShortcode(groups, "rip :skull:", 11)).toEqual({ text: "rip 💀", caret: 6 });
    expect(completeShortcode(groups, ":ghost: boo", 7)).toEqual({ text: "👻 boo", caret: 2 });
  });

  it("leaves unknown names and times alone", () => {
    expect(completeShortcode(groups, "rip :notanemoji:", 16)).toBeNull();
    expect(completeShortcode(groups, "at 10:30:", 9)).toBeNull();
  });
});
