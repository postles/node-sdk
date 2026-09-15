import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  DEFAULT_TOLERANCE_SECONDS,
  verifyWebhook,
  verifyWebhookSignature,
  WebhookVerificationError,
} from "./webhook"
import { type WebhookEvent } from "./types"

const SECRET = "whsec_test"
const TIMESTAMP = 1_754_000_000
const NOW_MS = TIMESTAMP * 1000

const body = JSON.stringify({
  event: "message.sent",
  project_id: 1,
  message_id: "msg_1",
  occurred_at: "2026-08-07T00:00:00Z",
})

const sign = (rawBody: string, secret: string, timestamp: number): string => {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")
  return `t=${timestamp},v1=${v1}`
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature within the freshness window", () => {
    const signature = sign(body, SECRET, TIMESTAMP)
    expect(
      verifyWebhookSignature({
        payload: body,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(true)
  })

  it("rejects a tampered body", () => {
    const signature = sign(body, SECRET, TIMESTAMP)
    expect(
      verifyWebhookSignature({
        payload: `${body} `,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false)
  })

  it("rejects a wrong secret", () => {
    const signature = sign(body, "whsec_other", TIMESTAMP)
    expect(
      verifyWebhookSignature({
        payload: body,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false)
  })

  it("rejects a stale/replayed timestamp beyond the tolerance", () => {
    const signature = sign(body, SECRET, TIMESTAMP)
    const staleNowMs = (TIMESTAMP + DEFAULT_TOLERANCE_SECONDS + 30) * 1000
    expect(
      verifyWebhookSignature({
        payload: body,
        signature,
        secret: SECRET,
        nowMs: staleNowMs,
      }),
    ).toBe(false)
  })

  it("accepts a timestamp within a custom tolerance", () => {
    const signature = sign(body, SECRET, TIMESTAMP)
    const nowMs = (TIMESTAMP + 45) * 1000
    expect(
      verifyWebhookSignature({
        payload: body,
        signature,
        secret: SECRET,
        toleranceSeconds: 60,
        nowMs,
      }),
    ).toBe(true)
  })

  it("accepts when one of several v1 values matches (secret rotation)", () => {
    const good = createHmac("sha256", SECRET)
      .update(`${TIMESTAMP}.${body}`)
      .digest("hex")
    const signature = `t=${TIMESTAMP},v1=deadbeef,v1=${good}`
    expect(
      verifyWebhookSignature({
        payload: body,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(true)
  })

  it("rejects a v1 with trailing non-hex characters", () => {
    const good = createHmac("sha256", SECRET)
      .update(`${TIMESTAMP}.${body}`)
      .digest("hex")
    const signature = `t=${TIMESTAMP},v1=${good}zz`
    expect(
      verifyWebhookSignature({
        payload: body,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false)
  })

  it("rejects a malformed or empty header", () => {
    expect(
      verifyWebhookSignature({
        payload: body,
        signature: "garbage",
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false)
    expect(
      verifyWebhookSignature({
        payload: body,
        signature: "",
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false)
  })

  it("returns false when the signature or secret is absent", () => {
    const signature = sign(body, SECRET, TIMESTAMP)
    expect(
      verifyWebhookSignature({ payload: body, secret: SECRET, nowMs: NOW_MS }),
    ).toBe(false)
    expect(
      verifyWebhookSignature({ payload: body, signature, nowMs: NOW_MS }),
    ).toBe(false)
  })
})

describe("verifyWebhook", () => {
  it("returns the parsed event for a valid signature", () => {
    const signature = sign(body, SECRET, TIMESTAMP)
    const event = verifyWebhook({
      payload: body,
      signature,
      secret: SECRET,
      nowMs: NOW_MS,
    })
    expect(event.event).toBe("message.sent")
    // The union narrows on `event`, so a message delivery exposes `message_id`
    // and a suppression delivery does not.
    if (event.event === "message.sent") expect(event.message_id).toBe("msg_1")
  })

  it("throws on an invalid signature", () => {
    const signature = sign(body, "whsec_other", TIMESTAMP)
    expect(() =>
      verifyWebhook({
        payload: body,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toThrow(WebhookVerificationError)
  })

  it("throws when the verified body is not valid JSON", () => {
    const raw = "not json"
    const signature = sign(raw, SECRET, TIMESTAMP)
    expect(() =>
      verifyWebhook({ payload: raw, signature, secret: SECRET, nowMs: NOW_MS }),
    ).toThrow(WebhookVerificationError)
  })

  it("exposes id on both body shapes without narrowing", () => {
    const dedupeKey = (event: WebhookEvent): string => event.id

    const bodies = [
      JSON.stringify({
        ...JSON.parse(body),
        id: "01890a5d-ac96-774b-bcce-b302099a8057",
      }),
      JSON.stringify({
        id: "01890a5d-ac96-774b-bcce-b302099a8058",
        event: "suppression.created",
        project_id: 1,
        channel: "email",
        address: "someone@example.com",
        reason: "unsubscribed",
        subscription_id: null,
        occurred_at: "2026-08-07T00:00:00Z",
      }),
    ]

    for (const raw of bodies) {
      const event = verifyWebhook({
        payload: raw,
        signature: sign(raw, SECRET, TIMESTAMP),
        secret: SECRET,
        nowMs: NOW_MS,
      })
      expect(dedupeKey(event)).toBe(JSON.parse(raw).id)
    }
  })
})
