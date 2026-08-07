import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import { idempotencyKey } from "./idempotency"

describe("idempotencyKey", () => {
  it("is deterministic for the same domain identifiers", () => {
    expect(idempotencyKey("app", "password-reset", "evt_123")).toBe(
      idempotencyKey("app", "password-reset", "evt_123"),
    )
  })

  it("joins normalized parts with a colon", () => {
    expect(idempotencyKey("app", "otp", 4821)).toBe("app:otp:4821")
  })

  it("collapses whitespace and trims parts", () => {
    expect(idempotencyKey("  app ", "order shipped", 1)).toBe(
      "app:order-shipped:1",
    )
  })

  it("does not collide when the delimiter appears inside a part", () => {
    expect(idempotencyKey("tenant:a", "event")).not.toBe(
      idempotencyKey("tenant", "a:event"),
    )
  })

  it("differs when any identifier differs", () => {
    expect(idempotencyKey("app", "evt_1")).not.toBe(
      idempotencyKey("app", "evt_2"),
    )
  })

  it("hashes to a stable digest when the key would exceed 255 chars", () => {
    const long = "x".repeat(300)
    const key = idempotencyKey("app", long)
    expect(key).toHaveLength(64)
    expect(key).toBe(createHash("sha256").update(`app:${long}`).digest("hex"))
    expect(key.length).toBeLessThanOrEqual(255)
  })

  it("throws when given no usable parts", () => {
    expect(() => idempotencyKey("", "   ")).toThrow()
  })
})
