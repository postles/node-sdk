import { DEFAULT_TIMEOUT_MS, type PostlesConfig } from "./config"
import { PostlesError, toPostlesError } from "./errors"
import { type ErrorBody } from "./types"

export interface RequestOptions {
  method: string
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  /** Whether the endpoint is expected to return a body (false for 204 responses). */
  expectBody?: boolean
}

/** Thin authenticated fetch wrapper shared by every resource namespace. */
export class HttpClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number
  private readonly headers: Record<string, string>
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(config: PostlesConfig) {
    if (!config.baseUrl) throw new Error("PostlesClient requires a baseUrl")
    if (!config.apiKey) throw new Error("PostlesClient requires an apiKey")

    this.baseUrl = config.baseUrl.replace(/\/+$/, "")
    this.apiKey = config.apiKey
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.headers = config.headers ?? {}
    this.fetchImpl = config.fetch ?? globalThis.fetch
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const { method, path, query, body, expectBody = true } = options

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      ...this.headers,
    }
    if (body !== undefined) headers["Content-Type"] = "application/json"

    let response: Response
    try {
      response = await this.fetchImpl(this.buildUrl(path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new PostlesError(
        `Request to ${method} ${path} failed: ${reason}`,
        0,
      )
    }

    if (!response.ok) {
      const errorBody = await this.safeJson<ErrorBody>(response)
      throw toPostlesError(
        response.status,
        response.headers,
        errorBody,
        `${method} ${path} failed with status ${response.status}`,
      )
    }

    if (!expectBody || response.status === 204) return undefined as T

    const text = await response.text()
    if (!text) {
      throw new PostlesError(
        `${method} ${path} returned ${response.status} with an empty body`,
        response.status,
      )
    }
    try {
      return JSON.parse(text) as T
    } catch {
      throw new PostlesError(
        `${method} ${path} returned ${response.status} with a malformed JSON body`,
        response.status,
      )
    }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  private async safeJson<T>(response: Response): Promise<T | undefined> {
    const text = await response.text()
    if (!text) return undefined
    try {
      return JSON.parse(text) as T
    } catch {
      return undefined
    }
  }
}
