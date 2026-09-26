import type { Movie } from "./api";

/** One night of the month, whether or not its movie has been picked yet. */
export interface Night {
  day: number;
  date: string; // "2026-10-27"
  movie: Movie | null;
}

/**
 * Every night of the lineup's month, in order. A lineup still being put
 * together has gaps; those nights get `movie: null` so the calendar and page
 * can show them as missing tapes instead of skipping them.
 */
export function nightsOf(movies: readonly Movie[]): Night[] {
  const first = movies[0];
  if (!first) return [];
  const [year, month] = first.date.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDay = new Map(movies.map((m) => [m.day, m]));
  const prefix = first.date.slice(0, 8); // "2026-10-"

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return { day, date: prefix + String(day).padStart(2, "0"), movie: byDay.get(day) ?? null };
  });
}

/** What a missing tape says; the two lines take turns, night by night. */
export function missingTapeLine(day: number): string {
  return day % 2 === 1 ? `Tape ${day}: footage unrecovered.` : "The tape is blank. For now.";
}
