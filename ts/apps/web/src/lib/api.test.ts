import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "./api";

const json = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("createApi", () => {
  it("lists a year's movies", async () => {
    const fetch = json(200, { movies: [{ id: "2025-01" }] });
    const movies = await createApi({ fetch }).movies(2025);

    expect(movies).toEqual([{ id: "2025-01" }]);
    expect(fetch).toHaveBeenCalledWith("/api/movies?year=2025", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("rates a movie", async () => {
    const fetch = json(200, { average: 8, count: 1, mine: 8 });
    const summary = await createApi({ fetch }).rate("2025-01", 8);

    expect(summary).toEqual({ average: 8, count: 1, mine: 8 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/movies/2025-01/rating");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ value: 8 });
  });

  it("raises ApiError with the server's message", async () => {
    const fetch = json(422, { error: { code: "invalid_rating", message: "rating must be 2, 4, 6, 8 or 10" } });
    await expect(createApi({ fetch }).rate("2025-01", 3)).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "invalid_rating",
    });
    expect(ApiError).toBeDefined();
  });
});
