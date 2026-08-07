import { createHash } from "node:crypto"

/** The API caps `idempotency_key` at 255 characters. */
const MAX_KEY_LENGTH = 255

const normalize = (part: string | number): string =>
  String(part).trim().replace(/\s+/g, "-")

// Escape the join delimiter (and the escape char itself) inside each part so
// distinct tuples cannot collide — without this, ["tenant:a", "event"] and
// ["tenant", "a:event"] both produce "tenant:a:event".
const escapePart = (part: string): string =>
  part.replace(/%/g, "%25").replace(/:/g, "%3A")

/**
 * Build a deterministic `idempotency_key` from domain identifiers (e.g. an app
 * name + event type + event id). The same inputs always yield the same key, so a
 * retried send is treated as an idempotent replay rather than a new message.
 *
 * Parts are normalized, escaped, and joined with `:`. If the result would exceed
 * the 255-character limit, it is replaced with a stable SHA-256 hex digest so the
 * key stays valid without losing determinism.
 */
export const idempotencyKey = (...parts: Array<string | number>): string => {
  const normalized = parts.map(normalize).filter((part) => part.length > 0)
  if (normalized.length === 0) {
    throw new Error("idempotencyKey requires at least one non-empty part")
  }

  const key = normalized.map(escapePart).join(":")
  if (key.length <= MAX_KEY_LENGTH) return key

  return createHash("sha256").update(key).digest("hex")
}
