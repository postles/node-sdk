/** Default per-request timeout, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000

export interface PostlesConfig {
  /**
   * Full API base URL including the version path, e.g.
   * `https://api.postles.com/v1`. A trailing slash is tolerated.
   */
  baseUrl: string
  /**
   * Secret API key. Sent as `Authorization: Bearer <apiKey>`; it identifies the
   * acting project.
   */
  apiKey: string
  /** Per-request timeout in milliseconds; defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Extra headers merged into every request. */
  headers?: Record<string, string>
  /** Custom `fetch` implementation; defaults to the global `fetch`. Injectable for tests. */
  fetch?: typeof globalThis.fetch
}
