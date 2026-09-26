import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalytics, type AnalyticsEvent } from "./analytics";

function setup() {
  const sent: AnalyticsEvent[][] = [];
  const beaconed: AnalyticsEvent[][] = [];
  const storage = new Map<string, string>();
  const analytics = createAnalytics({
    send: vi.fn(async (events: AnalyticsEvent[]) => {
      sent.push(events);
    }),
    beacon: vi.fn((events: AnalyticsEvent[]) => {
      beaconed.push(events);
    }),
    session: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
    location: () => ({ pathname: "/", hash: "#movie-3" }),
    referrer: () => "https://letterboxd.com/",
    flushDelayMs: 1000,
  });
  return { analytics, sent, beaconed, storage };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-10-03T20:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("analytics", () => {
  it("sends the initial page view immediately", async () => {
    const { analytics, sent } = setup();

    await analytics.pageView();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([
      {
        type: "page_view",
        sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
        path: "/#movie-3",
        referrer: "https://letterboxd.com/",
        occurredAt: "2025-10-03T20:00:00.000Z",
        props: {},
      },
    ]);
  });

  it("batches later events and sends them together", async () => {
    const { analytics, sent } = setup();

    analytics.track("day_selected", { day: 7 });
    analytics.track("calendar_toggled");
    expect(sent).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.map((e) => e.type)).toEqual(["day_selected", "calendar_toggled"]);
    expect(sent[0]?.[0]?.props).toEqual({ day: 7 });
  });

  it("uses a beacon for anything queued when the page is hidden", () => {
    const { analytics, sent, beaconed } = setup();

    analytics.track("outbound_link_clicked", { href: "https://letterboxd.com" });
    analytics.flushOnExit();

    expect(beaconed).toHaveLength(1);
    expect(beaconed[0]?.[0]?.type).toBe("outbound_link_clicked");
    expect(sent).toHaveLength(0);
  });

  it("keeps one session id per browser tab", async () => {
    const first = setup();
    await first.analytics.pageView();
    const id = first.sent[0]?.[0]?.sessionId;

    first.analytics.track("x");
    await vi.advanceTimersByTimeAsync(1000);
    expect(first.sent[1]?.[0]?.sessionId).toBe(id);
    expect(first.storage.size).toBe(1);
  });

  it("never throws when sending fails", async () => {
    const analytics = createAnalytics({
      send: async () => {
        throw new Error("offline");
      },
      beacon: () => {},
      session: { getItem: () => null, setItem: () => {} },
      location: () => ({ pathname: "/", hash: "" }),
      referrer: () => "",
    });
    await expect(analytics.pageView()).resolves.toBeUndefined();
  });
});
