import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTurnstile } from "./useTurnstile";

type Opts = { sitekey: string; callback(token: string): void };

function installFakeTurnstile() {
  let opts: Opts | undefined;
  const fake = {
    render: vi.fn((_el: HTMLElement, o: Opts) => {
      opts = o;
      return "widget-1";
    }),
    reset: vi.fn(),
    solve: (token: string) => opts?.callback(token),
  };
  (window as unknown as { turnstile: unknown }).turnstile = fake;
  return fake;
}

let getToken: () => Promise<string> = async () => "";

function Harness({ siteKey }: { siteKey?: string }) {
  const t = useTurnstile(siteKey);
  getToken = t.getToken;
  return <div ref={t.ref} data-testid="widget" />;
}

afterEach(() => {
  delete (window as unknown as { turnstile?: unknown }).turnstile;
});

describe("useTurnstile", () => {
  it("returns an empty token when no site key is configured", async () => {
    render(<Harness />);
    await expect(getToken()).resolves.toBe("");
  });

  it("renders the widget and hands out each token once", async () => {
    const fake = installFakeTurnstile();
    render(<Harness siteKey="site-key" />);
    await vi.waitFor(() => expect(fake.render).toHaveBeenCalled());
    expect(fake.render.mock.calls[0]?.[1]).toMatchObject({ sitekey: "site-key" });

    act(() => fake.solve("tok-1"));
    await expect(getToken()).resolves.toBe("tok-1");
    expect(fake.reset).toHaveBeenCalledWith("widget-1"); // tokens are single-use

    // The next call waits for the widget to produce a fresh token.
    const next = getToken();
    act(() => fake.solve("tok-2"));
    await expect(next).resolves.toBe("tok-2");
  });
});
