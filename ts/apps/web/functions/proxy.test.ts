import { describe, expect, it, vi } from "vitest";
import { proxyToApi } from "./proxy";

describe("proxyToApi", () => {
  it("forwards the request to the API origin with client details", async () => {
    const upstream = vi.fn(async (_req: Request) => {
      const res = new Response('{"ok":true}', { status: 202 });
      res.headers.append("Set-Cookie", "vid=abc.sig; Path=/; HttpOnly");
      return res;
    });

    const res = await proxyToApi(
      new Request("https://31nightsofhorror.com/api/events?x=1", {
        method: "POST",
        body: '{"events":[]}',
        headers: {
          Cookie: "vid=abc.sig",
          "CF-Connecting-IP": "203.0.113.7",
          "CF-IPCountry": "US",
        },
      }),
      "https://api-abc123-uc.a.run.app",
      upstream,
    );

    const sent = upstream.mock.calls[0]![0];
    expect(sent.url).toBe("https://api-abc123-uc.a.run.app/api/events?x=1");
    expect(sent.method).toBe("POST");
    expect(await sent.text()).toBe('{"events":[]}');
    expect(sent.headers.get("Cookie")).toBe("vid=abc.sig");
    expect(sent.headers.get("X-Client-IP")).toBe("203.0.113.7");
    expect(sent.headers.get("X-Client-Country")).toBe("US");
    expect(sent.headers.get("X-Forwarded-Host")).toBe("31nightsofhorror.com");

    expect(res.status).toBe(202);
    expect(res.headers.get("Set-Cookie")).toContain("vid=abc.sig");
  });

  it("returns 502 when the API origin isn't configured", async () => {
    const res = await proxyToApi(new Request("https://x.test/api/movies"), undefined, vi.fn());
    expect(res.status).toBe(502);
  });
});
