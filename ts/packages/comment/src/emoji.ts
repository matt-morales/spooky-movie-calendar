// Emoji data and search for the emoji tray and ":" suggestions. The data
// (every emoji with its name and group, ~32 KB gzipped) is loaded on first
// use, so pages that never open the tray don't pay for it.

export interface Emoji {
  emoji: string;
  name: string; // "face screaming in fear"
  slug: string; // "face_screaming_in_fear", what ":" matches
}

export interface EmojiGroup {
  name: string; // "Smileys & Emotion"
  emojis: Emoji[];
}

// Newer emoji show as empty boxes on phones that haven't updated yet.
const MAX_EMOJI_VERSION = 14;

let loading: Promise<EmojiGroup[]> | null = null;

export function loadEmoji(): Promise<EmojiGroup[]> {
  loading ??= import("unicode-emoji-json/data-by-group.json").then(({ default: data }) =>
    data.map((g) => ({
      name: g.name,
      emojis: g.emojis
        .filter((e) => Number(e.emoji_version) <= MAX_EMOJI_VERSION)
        .map((e) => ({ emoji: e.emoji, name: e.name, slug: e.slug })),
    })),
  );
  return loading;
}

const squash = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Emoji whose names match the query, best first: the whole name, then any
 * word starting with it, then anywhere. Ties keep the tray's order, so faces
 * come before objects (":scre" offers 😱 before 🪛). Case, spaces and
 * underscores don't matter, so "thumbsup" finds 👍 like Slack's :thumbsup:.
 */
export function searchEmoji(groups: EmojiGroup[], query: string, limit: number): Emoji[] {
  const q = squash(query);
  if (!q) return [];
  const ranked: { e: Emoji; rank: number; order: number }[] = [];
  let order = 0;
  for (const g of groups) {
    for (const e of g.emojis) {
      const slug = squash(e.slug);
      const rank =
        slug === q ? 0
        : slug.startsWith(q) || e.slug.split("_").some((w) => w.startsWith(q)) ? 1
        : slug.includes(q) ? 2
        : -1;
      if (rank >= 0) ranked.push({ e, rank, order: order });
      order++;
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.slice(0, limit).map((r) => r.e);
}

/**
 * The ":query" being typed right before the caret, if any. Like Slack, it
 * needs two characters and a space (or the start) before the colon, so times
 * like 10:30 and URLs don't trigger it.
 */
export function colonQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s):([\w+-]{2,})$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: m.index + m[1]!.length, query: m[2]! };
}

/** Turns a just-typed ":name:" into its emoji, e.g. ":skull:" → 💀. */
export function completeShortcode(
  groups: EmojiGroup[],
  text: string,
  caret: number,
): { text: string; caret: number } | null {
  const m = /(^|\s):([\w+-]+):$/.exec(text.slice(0, caret));
  if (!m) return null;
  const slug = m[2]!.toLowerCase();
  const found = groups.flatMap((g) => g.emojis).find((e) => e.slug === slug);
  if (!found) return null;
  const start = m.index + m[1]!.length;
  return { text: text.slice(0, start) + found.emoji + text.slice(caret), caret: start + found.emoji.length };
}

/** Puts an emoji into text at the caret (replacing any selection). */
export function insertAt(text: string, from: number, to: number, emoji: string): { text: string; caret: number } {
  return { text: text.slice(0, from) + emoji + text.slice(to), caret: from + emoji.length };
}
