import { describe, expect, it } from "vitest"

import { PostlesClient } from "./client"
import { idempotencyKey } from "./idempotency"
import { type MessageState } from "./types"

/**
 * End-to-end check against a live Postles project. Skipped unless the env vars
 * are set, so unit runs and CI without credentials stay green:
 *
 *   POSTLES_BASE_URL   full API base, e.g. https://api.postles.com/v1
 *   POSTLES_API_KEY    a secret API key (sk_…)
 *   POSTLES_PROVIDER_ID  optional provider id (else the project default)
 *   POSTLES_TEST_EMAIL   optional recipient address (default sink@example.com)
 *
 * It sends one message, asserts it is accepted, then polls the message until it
 * leaves `queued`.
 */
const baseUrl = process.env.POSTLES_BASE_URL
const apiKey = process.env.POSTLES_API_KEY
const providerId = process.env.POSTLES_PROVIDER_ID
const testEmail = process.env.POSTLES_TEST_EMAIL ?? "sink@example.com"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!baseUrl || !apiKey)("PostlesClient integration", () => {
  it("sends a message and reflects state on getMessage", async () => {
    const client = new PostlesClient({ baseUrl: baseUrl!, apiKey: apiKey! })

    const accepted = await client.transactional.send({
      idempotency_key: idempotencyKey("postles-node-it", Date.now()),
      channel: "email",
      stream: "transactional",
      provider_id: providerId ? Number(providerId) : undefined,
      to: { email: testEmail },
      content: {
        pre_rendered: true,
        subject: "postles node SDK integration test",
        html: "<p>integration</p>",
        text: "integration",
      },
      metadata: { source: "postles-node-sdk-integration-test" },
    })

    expect(accepted.message_id).toBeTruthy()
    expect(accepted.state).toBe("queued")

    const terminalish: MessageState[] = [
      "sending",
      "sent",
      "delivered",
      "failed",
      "bounced",
    ]
    let state: MessageState = accepted.state
    for (
      let attempt = 0;
      attempt < 20 && !terminalish.includes(state);
      attempt++
    ) {
      await delay(500)
      const message = await client.transactional.getMessage(accepted.message_id)
      expect(message.message_id).toBe(accepted.message_id)
      state = message.state
    }

    expect(terminalish).toContain(state)
  }, 30_000)
})
