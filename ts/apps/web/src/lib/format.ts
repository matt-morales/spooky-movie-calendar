const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y ?? 0, month: MONTHS[(m ?? 1) - 1] ?? "", day: d ?? 0 };
}

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "2025-10-01" → "October 1st" */
export function nightLabel(iso: string): string {
  const { month, day } = parts(iso);
  return `${month} ${ordinal(day)}`;
}

/** "October 2025", from the first movie in the lineup. */
export function monthLabel(movies: ReadonlyArray<{ date: string }>): string {
  const first = movies[0];
  if (!first) return "";
  const { month, year } = parts(first.date);
  return `${month} ${year}`;
}

/** Ratings are stored 2–10 and shown as 1–5 blood drops. */
export function averageDrops(average: number): string {
  return (average / 2).toFixed(1);
}

/** "2025-10-01" → { month: "Oct", day: "01" } for the card's date column. */
export function calendarDate(iso: string): { month: string; day: string } {
  const { month, day } = parts(iso);
  return { month: month.slice(0, 3), day: String(day).padStart(2, "0") };
}

/** A 2–10 average as a score out of ten: 8 → "8", 7.25 → "7.3". */
export function outOfTen(average: number): string {
  return String(Number(average.toFixed(1)));
}

/** The visitor's local calendar day, in the same form as Movie.date. */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The film's Letterboxd page, or a Letterboxd search until the URL is filled in. */
export function letterboxdLink(movie: { title: string; letterboxdUrl?: string }): string {
  return movie.letterboxdUrl || `https://letterboxd.com/search/films/${encodeURIComponent(movie.title)}/`;
}
