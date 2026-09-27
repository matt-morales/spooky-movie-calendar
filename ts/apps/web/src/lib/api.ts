// Client for the Go API (go/internal/adapter/httpapi). Same origin: in
// production a Cloudflare Pages Function proxies /api/* to Cloud Run.

export interface RatingSummary {
  average: number; // 2–10 scale
  count: number;
  mine: number | null;
}

export interface Movie {
  id: string; // "2025-07"
  year: number;
  day: number;
  date: string; // "2025-10-07"
  title: string;
  directors: string[];
  description: string;
  posterUrl: string;
  releaseYear?: number;
  letterboxdUrl?: string;
  hostRating?: number;
  rating: RatingSummary;
}

/** A year's lineup: its nights, plus the Letterboxd list it's published as. */
export interface Lineup {
  movies: Movie[];
  letterboxdListUrl?: string;
}

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Api {
  lineup(year: number): Promise<Lineup>;
  rate(movieId: string, value: number): Promise<RatingSummary>;
}

export function createApi({ fetch: doFetch = fetch }: { fetch?: typeof fetch } = {}): Api {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await doFetch("/api" + path, {
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body?.error?.code ?? "unknown", body?.error?.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    lineup: async (year) => {
      const body = await request<{ movies: Movie[]; lineup?: { letterboxdListUrl?: string } }>(`/movies?year=${year}`);
      return { movies: body.movies, letterboxdListUrl: body.lineup?.letterboxdListUrl };
    },
    rate: (movieId, value) =>
      request(`/movies/${encodeURIComponent(movieId)}/rating`, { method: "PUT", body: JSON.stringify({ value }) }),
  };
}
