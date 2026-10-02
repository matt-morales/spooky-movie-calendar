import { useEffect, useState } from "react";

// How long ago something happened, in the reader's language: "just now",
// "5 minutes ago", "yesterday"; after a week, the date.

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const seconds = (now - then) / 1000;
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return relative.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 22) return relative.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return relative.format(-days, "day");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** The exact date and time, for a tooltip. */
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

/** The current time, updated every minute so "5 minutes ago" keeps counting. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
