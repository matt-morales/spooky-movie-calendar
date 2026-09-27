// Which lineup a URL is for. The year lives in the path ("/2026"), so every
// year has a stable link; "/" and old "?year=2025" links are rewritten to it.

export interface Route {
  year: number;
  url: string; // the canonical URL for this page, e.g. "/2026#movie-12"
}

const isLineupYear = (y: number) => Number.isInteger(y) && y >= 2025 && y <= 2100;

export function routeFor(loc: { pathname: string; search: string; hash: string }, defaultYear: number): Route {
  const fromPath = loc.pathname.match(/^\/(\d{4})\/?$/)?.[1];
  const fromQuery = new URLSearchParams(loc.search).get("year");
  const asked = Number(fromPath ?? fromQuery);
  const year = isLineupYear(asked) ? asked : defaultYear;
  return { year, url: `/${year}${loc.hash}` };
}
