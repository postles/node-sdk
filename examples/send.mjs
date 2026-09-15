// Send a real message through the Postles API and poll its state.
//
//   POSTLES_BASE_URL=https://api.postles.com/v1 \
//   POSTLES_API_KEY=sk_live_... \
//   POSTLES_TO=you@example.com \
//   npm run example:send
//
// Set POSTLES_PROVIDER_ID to target a specific provider (otherwise the project
// default is used).
import { PostlesClient, idempotencyKey } from "../dist/index.js"

const baseUrl = process.env.POSTLES_BASE_URL
const apiKey = process.env.POSTLES_API_KEY
const to = process.env.POSTLES_TO ?? "sink@example.com"
const providerIdRaw = process.env.POSTLES_PROVIDER_ID
const providerId =
  providerIdRaw && Number.isFinite(Number(providerIdRaw))
    ? Number(providerIdRaw)
    : undefined

if (!baseUrl || !apiKey) {
  console.error("Set POSTLES_BASE_URL and POSTLES_API_KEY to run this example.")
  process.exit(1)
}

const postles = new PostlesClient({ baseUrl, apiKey })

const accepted = await postles.transactional.send({
  idempotency_key: idempotencyKey("example-send", Date.now()),
  channel: "email",
  provider_id: providerId,
  to: { email: to },
  content: {
    pre_rendered: true,
    subject: "Postles Node SDK example",
    html: "<p>Sent from the @postles/node example.</p>",
    text: "Sent from the @postles/node example.",
  },
})
console.log("accepted:", accepted)

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 10; i++) {
  await delay(1000)
  const message = await postles.transactional.getMessage(accepted.message_id)
  console.log(`state: ${message.state}`)
  if (["sent", "delivered", "failed", "bounced"].includes(message.state)) break
}
