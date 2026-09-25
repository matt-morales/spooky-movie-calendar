import { useCallback, useEffect, useRef, useState } from "react";

// Cloudflare Turnstile: a privacy-friendly CAPTCHA replacement. The widget
// usually solves itself invisibly; it only asks for a click when unsure.
// For local development use the always-passing site key "1x00000000000000000000AA".

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => reject(new Error("failed to load turnstile"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Renders a Turnstile widget into the element given to `ref` and returns
 * `getToken`, which resolves with a fresh single-use token. Without a site key
 * it's a no-op that returns "".
 */
export function useTurnstile(siteKey?: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const token = useRef<string | null>(null);
  const waiters = useRef<Array<(t: string) => void>>([]);

  useEffect(() => {
    if (!siteKey || !el) return;
    let cancelled = false;
    loadTurnstile().then((api) => {
      if (cancelled) return;
      const id = api.render(el, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: (t: string) => {
          const waiter = waiters.current.shift();
          if (waiter) {
            waiter(t);
            api.reset(id);
          } else {
            token.current = t;
          }
        },
        "expired-callback": () => {
          token.current = null;
        },
      });
      widget.current = { api, id };
    });
    return () => {
      cancelled = true;
    };
  }, [siteKey, el]);

  const getToken = useCallback((): Promise<string> => {
    if (!siteKey) return Promise.resolve("");
    const t = token.current;
    if (t) {
      token.current = null;
      if (widget.current) widget.current.api.reset(widget.current.id);
      return Promise.resolve(t);
    }
    return new Promise((resolve) => waiters.current.push(resolve));
  }, [siteKey]);

  return { ref: setEl, getToken };
}
