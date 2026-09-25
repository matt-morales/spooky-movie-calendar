import type { Comment, PostInput, ThreadPage } from "./types";

export interface CommentClient {
  thread(threadKey: string, before?: number): Promise<ThreadPage>;
  post(threadKey: string, input: PostInput): Promise<Comment>;
  remove(id: number): Promise<void>;
}

export class CommentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommentApiError";
  }
}

interface Options {
  baseUrl?: string; // where the Go API is mounted, default "/api"
  fetch?: typeof fetch;
}

export function createCommentClient({ baseUrl = "/api", fetch: doFetch = fetch }: Options = {}): CommentClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await doFetch(baseUrl + path, {
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new CommentApiError(
        res.status,
        body?.error?.code ?? "unknown",
        body?.error?.message ?? `Request failed (${res.status})`,
      );
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const threadPath = (key: string) => `/threads/${encodeURIComponent(key)}/comments`;

  return {
    thread: (key, before = 0) => request(`${threadPath(key)}?before=${before}`),
    post: (key, input) => request(threadPath(key), { method: "POST", body: JSON.stringify(input) }),
    remove: (id) => request(`/comments/${id}`, { method: "DELETE" }),
  };
}
