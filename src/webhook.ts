import { createHmac, timingSafeEqual } from "node:crypto"

import { type WebhookEvent } from "./types"

/** Default freshness window for a webhook timestamp, in seconds. */
export const DEFAULT_TOLERANCE_SECONDS = 300

const SIGNATURE_HEADER = "X-Postles-Signature"

/** Thrown when a webhook signature is missing, malformed, stale, or does not match. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebhookVerificationError"
  }
}

export interface VerifyWebhookOptions {
  /** The exact raw request body bytes, before any JSON parsing. */
  payload: string | Buffer | Uint8Array
  /** The `X-Postles-Signature` header value. */
  signature: string
  /** The signing secret configured for the webhook endpoint. */
  secret: string
  /** Freshness window in seconds; defaults to {@link DEFAULT_TOLERANCE_SECONDS}. */
  toleranceSeconds?: number
  /** Current time in epoch milliseconds; defaults to `Date.now()`. Injectable for tests. */
  nowMs?: number
}

interface ParsedSignature {
  timestamp: number
  signatures: string[]
}

// `t=<unix_seconds>,v1=<hex>` — tolerate multiple `v1=` entries (rotation) and
// unknown keys so future scheme additions do not break verification.
const parseSignatureHeader = (header: string): ParsedSignature | null => {
  let timestamp: number | undefined
  const signatures: string[] = []

  for (const part of header.split(",")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key === "t") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) timestamp = parsed
    } else if (key === "v1") {
      signatures.push(value)
    }
  }

  if (timestamp === undefined || signatures.length === 0) return null
  return { timestamp, signatures }
}

const toBuffer = (payload: string | Buffer | Uint8Array): Buffer =>
  typeof payload === "string"
    ? Buffer.from(payload, "utf8")
    : Buffer.from(payload)

const HEX_RE = /^[0-9a-f]+$/i

// `Buffer.from(_, "hex")` silently stops at the first non-hex character, so a
// candidate like `<valid digest>zz` would otherwise decode to the valid digest
// and compare equal. Require both sides to be well-formed, equal-length hex
// before the timing-safe compare so malformed candidates return `false`.
const hexEquals = (a: string, b: string): boolean => {
  if (a.length === 0 || a.length !== b.length) return false
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return false
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

/**
 * Verify an outbound webhook signature. The signed payload is `"<t>.<raw_body>"`
 * (HMAC-SHA256, hex), matching the `X-Postles-Signature` scheme. Returns `true`
 * only when the signature matches AND the timestamp is within the freshness
 * window. Never throws on a malformed signature — it returns `false`.
 *
 * The freshness window bounds how long a captured delivery stays replayable; it
 * is NOT strict replay protection — a delivery replayed inside the window still
 * verifies. For exactly-once handling, dedupe on a processed-delivery id
 * (e.g. the event's `message_id` + `occurred_at`) on top of this check.
 */
export const verifyWebhookSignature = (
  options: VerifyWebhookOptions,
): boolean => {
  const { payload, signature, secret } = options
  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  const nowMs = options.nowMs ?? Date.now()

  if (!signature || !secret) return false

  const parsed = parseSignatureHeader(signature)
  if (!parsed) return false

  const skewSeconds = Math.abs(nowMs / 1000 - parsed.timestamp)
  if (skewSeconds > toleranceSeconds) return false

  const signedPayload = Buffer.concat([
    Buffer.from(`${parsed.timestamp}.`, "utf8"),
    toBuffer(payload),
  ])
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex")

  return parsed.signatures.some((candidate) => hexEquals(expected, candidate))
}

/**
 * Verify a webhook and return the parsed {@link WebhookEvent}. Throws
 * {@link WebhookVerificationError} if the signature is invalid, stale, or the body
 * is not valid JSON. Prefer this over {@link verifyWebhookSignature} when you also
 * want the typed event.
 */
export const verifyWebhook = (options: VerifyWebhookOptions): WebhookEvent => {
  if (!verifyWebhookSignature(options)) {
    throw new WebhookVerificationError(
      `Invalid or stale ${SIGNATURE_HEADER}: signature did not verify within the freshness window.`,
    )
  }

  const raw = toBuffer(options.payload).toString("utf8")
  try {
    return JSON.parse(raw) as WebhookEvent
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON.")
  }
}
