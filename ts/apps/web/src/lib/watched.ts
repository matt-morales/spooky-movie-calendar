// "Mark as watched" is a per-browser checklist, kept in localStorage. Storage
// can be unavailable (private windows, blocked site data), so failures are
// ignored and the page simply starts with nothing watched.

const KEY = "watched_movies";

export function loadWatched(storage: Pick<Storage, "getItem"> = localStorage): string[] {
  try {
    const ids: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveWatched(ids: string[], storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Not fatal: the checklist just won't survive a reload.
  }
}
