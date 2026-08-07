import { type ErrorBody, type ErrorDetail } from "./types"

/** Base error for every non-2xx API response. */
export class PostlesError extends Error {
  readonly status: number
  readonly code?: string
  readonly body?: ErrorBody

  constructor(
    message: string,
    status: number,
    code?: string,
    body?: ErrorBody,
  ) {
    super(message)
    this.name = "PostlesError"
    this.status = status
    this.code = code
    this.body = body
  }
}

/** 401 / 403 — missing, invalid, or insufficiently scoped API key. */
export class PostlesAuthError extends PostlesError {
  constructor(
    message: string,
    status: number,
    code?: string,
    body?: ErrorBody,
  ) {
    super(message, status, code, body)
    this.name = "PostlesAuthError"
  }
}

/** 404 — resource not found in this project. */
export class PostlesNotFoundError extends PostlesError {
  constructor(
    message: string,
    status: number,
    code?: string,
    body?: ErrorBody,
  ) {
    super(message, status, code, body)
    this.name = "PostlesNotFoundError"
  }
}

/** 422 / 413 — the request failed validation or exceeded a size limit. */
export class PostlesValidationError extends PostlesError {
  constructor(
    message: string,
    status: number,
    code?: string,
    body?: ErrorBody,
  ) {
    super(message, status, code, body)
    this.name = "PostlesValidationError"
  }
}

/** 429 — the per-key request rate limit was exceeded. */
export class PostlesRateLimitError extends PostlesError {
  /** Seconds to wait before retrying, from the `Retry-After` header when present. */
  readonly retryAfterSeconds?: number

  constructor(
    message: string,
    status: number,
    retryAfterSeconds?: number,
    code?: string,
    body?: ErrorBody,
  ) {
    super(message, status, code, body)
    this.name = "PostlesRateLimitError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const detailOf = (body?: ErrorBody): ErrorDetail | undefined => {
  const error = body?.error
  if (error == null) return undefined
  return typeof error === "string" ? { message: error } : error
}

const retryAfter = (headers: Headers): number | undefined => {
  const raw = headers.get("retry-after")
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) ? seconds : undefined
}

/** Map a non-2xx response (with its already-parsed error body) to the right error class. */
export const toPostlesError = (
  status: number,
  headers: Headers,
  body: ErrorBody | undefined,
  fallbackMessage: string,
): PostlesError => {
  const detail = detailOf(body)
  const message = detail?.message ?? fallbackMessage
  const code = detail?.code

  switch (status) {
    case 401:
    case 403:
      return new PostlesAuthError(message, status, code, body)
    case 404:
      return new PostlesNotFoundError(message, status, code, body)
    case 413:
    case 422:
      return new PostlesValidationError(message, status, code, body)
    case 429:
      return new PostlesRateLimitError(
        message,
        status,
        retryAfter(headers),
        code,
        body,
      )
    default:
      return new PostlesError(message, status, code, body)
  }
}
