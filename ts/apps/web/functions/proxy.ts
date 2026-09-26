// Forwards a request to the Go API on Cloud Run, keeping the browser on one
// origin (so the visitor cookie is first-party and no CORS is needed).
//
// Cloudflare's own CF-* headers aren't reliably passed to another origin, so
// the client's IP and country are copied to X-Client-* headers for the API.

export async function proxyToApi(
  request: Request,
  apiOrigin: string | undefined,
  upstream: (req: Request) => Promise<Response> = fetch,
): Promise<Response> {
  if (!apiOrigin) {
    return Response.json({ error: { code: "misconfigured", message: "API_ORIGIN is not set" } }, { status: 502 });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, apiOrigin);

  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Client-IP", request.headers.get("CF-Connecting-IP") ?? "");
  headers.set("X-Client-Country", request.headers.get("CF-IPCountry") ?? "");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return upstream(
    new Request(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    }),
  );
}
