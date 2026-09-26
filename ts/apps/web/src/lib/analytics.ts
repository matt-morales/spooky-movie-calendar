// Site analytics. Every visit starts with a page_view sent straight to the Go
// API; that first request also issues the visitor cookie and wakes Cloud Run
// and Neon if they were idle. Later events are batched, and anything still
// queued when the page is hidden goes out with navigator.sendBeacon.

export interface AnalyticsEvent {
  type: string; // snake_case, e.g. "day_selected"
  sessionId: string;
  path: string;
  referrer: string;
  occurredAt: string; // ISO 8601
  props: Record<string, unknown>;
}

interface Deps {
  send(events: AnalyticsEvent[]): Promise<void>;
  beacon(events: AnalyticsEvent[]): void;
  session: Pick<Storage, "getItem" | "setItem">;
  location(): { pathname: string; hash: string };
  referrer(): string;
  flushDelayMs?: number;
}

export interface Analytics {
  pageView(): Promise<void>;
  track(type: string, props?: Record<string, unknown>): void;
  flushOnExit(): void;
}

const SESSION_KEY = "analytics_session";
const MAX_BATCH = 25; // matches the API's limit

export function createAnalytics(deps: Deps): Analytics {
  const delay = deps.flushDelayMs ?? 2000;
  let queue: AnalyticsEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function sessionId(): string {
    let id = deps.session.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      deps.session.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function event(type: string, props: Record<string, unknown> = {}): AnalyticsEvent {
    const { pathname, hash } = deps.location();
    return {
      type,
      sessionId: sessionId(),
      path: pathname + hash,
      referrer: deps.referrer(),
      occurredAt: new Date().toISOString(),
      props,
    };
  }

  async function send(events: AnalyticsEvent[]) {
    try {
      await deps.send(events);
    } catch {
      // Analytics must never break the page.
    }
  }

  function take(): AnalyticsEvent[] {
    clearTimeout(timer);
    timer = undefined;
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    return batch;
  }

  return {
    pageView: () => send([event("page_view")]),

    track(type, props) {
      queue.push(event(type, props));
      if (queue.length >= MAX_BATCH) void send(take());
      else timer ??= setTimeout(() => void send(take()), delay);
    },

    flushOnExit() {
      while (queue.length > 0) deps.beacon(take());
    },
  };
}

function randomId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** Wires analytics to the real browser. */
export function browserAnalytics(endpoint = "/api/events"): Analytics {
  const body = (events: AnalyticsEvent[]) => JSON.stringify({ events });
  const analytics = createAnalytics({
    send: async (events) => {
      await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: body(events),
        keepalive: true,
      });
    },
    beacon: (events) => {
      navigator.sendBeacon(endpoint, new Blob([body(events)], { type: "application/json" }));
    },
    session: sessionStorage,
    location: () => window.location,
    referrer: () => document.referrer,
  });
  addEventListener("pagehide", () => analytics.flushOnExit());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") analytics.flushOnExit();
  });
  return analytics;
}
