// Zero-credential end-to-end check: runs the built SDK against an in-process
// mock of the send API, so you can validate the library with no account.
//
//   npm run smoke
//
// It exercises send, sendBatch, getMessage, and webhook verification, and exits
// non-zero if anything is off.
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { createServer } from "node:http"

import { PostlesClient, idempotencyKey, verifyWebhook } from "../dist/index.js"

const messages = new Map()

// Minimal stand-in for the send API — just enough to prove the client's request
// shaping, routing, and response parsing.
const server = createServer((req, res) => {
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", () => {
    const url = new URL(req.url, "http://localhost")
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {}
    const json = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(payload))
    }

    if (req.method === "POST" && url.pathname === "/v1/send") {
      const id = `msg_${messages.size + 1}`
      messages.set(id, { message_id: id, state: "sent", channel: body.channel })
      return json(202, { message_id: id, state: "queued" })
    }
    if (req.method === "POST" && url.pathname === "/v1/send/batch") {
      const results = body.messages.map((m, i) => ({
        idempotency_key: m.idempotency_key,
        status: "queued",
        message_id: `msg_batch_${i + 1}`,
      }))
      return json(202, { results })
    }
    if (req.method === "GET" && url.pathname.startsWith("/v1/messages/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop())
      const message = messages.get(id)
      return message
        ? json(200, message)
        : json(404, { status: "error", error: "not found" })
    }
    return json(404, { status: "error", error: "unknown route" })
  })
})

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const { port } = server.address()

try {
  const postles = new PostlesClient({
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "sk_smoke_test",
  })

  // 1) Send a single message with no idempotency_key — the SDK generates one
  //    and returns it.
  const accepted = await postles.transactional.send({
    channel: "email",
    to: { email: "sink@example.com" },
    content: { pre_rendered: true, subject: "Hello", html: "<p>Hi</p>" },
  })
  assert.equal(accepted.state, "queued")
  assert.ok(accepted.message_id)
  assert.ok(accepted.idempotency_key)
  console.log(
    `  ✓ send -> ${accepted.message_id} (${accepted.state}), key ${accepted.idempotency_key}`,
  )

  // 2) Fetch its state.
  const message = await postles.transactional.getMessage(accepted.message_id)
  assert.equal(message.message_id, accepted.message_id)
  assert.equal(message.state, "sent")
  console.log(`  ✓ getMessage -> ${message.state}`)

  // 3) Batch send.
  const batch = await postles.transactional.sendBatch({
    channel: "email",
    content: { template: "digest" },
    messages: [
      {
        idempotency_key: idempotencyKey("smoke", "digest", "a"),
        to: { email: "a@example.com" },
      },
      {
        idempotency_key: idempotencyKey("smoke", "digest", "b"),
        to: { email: "b@example.com" },
      },
    ],
  })
  assert.equal(batch.results.length, 2)
  console.log(`  ✓ sendBatch -> ${batch.results.length} results`)

  // 4) Verify a webhook signed the way the server signs them.
  const secret = "whsec_smoke"
  const payload = JSON.stringify({
    event: "message.delivered",
    project_id: 1,
    message_id: accepted.message_id,
    occurred_at: new Date().toISOString(),
  })
  const t = Math.floor(Date.now() / 1000)
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex")
  const event = verifyWebhook({
    payload,
    signature: `t=${t},v1=${v1}`,
    secret,
  })
  assert.equal(event.event, "message.delivered")
  console.log(`  ✓ verifyWebhook -> ${event.event}`)

  console.log("\nSmoke check passed ✅")
} finally {
  server.close()
}
