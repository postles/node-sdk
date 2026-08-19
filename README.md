# @postles/node

Official Node.js / TypeScript SDK for the [Postles](https://postles.com) send API —
a typed client for sending transactional and broadcast messages (email, SMS,
push, webhook) and verifying inbound webhooks.

- Fully typed requests and responses.
- Zero runtime dependencies — uses the built-in `fetch` and `node:crypto`.
- ESM and CommonJS builds; Node 18+.

## Install

```sh
npm install @postles/node
```

## Quick start

```ts
import { PostlesClient, idempotencyKey } from "@postles/node"

const postles = new PostlesClient({
  baseUrl: "https://api.postles.com/v1",
  apiKey: process.env.POSTLES_API_KEY!, // a secret key (sk_…)
})

// Send one message. `idempotency_key` is optional — pass one derived from a
// domain event id when you want retries to collapse onto the same message;
// omit it and the SDK generates one for you (returned as `idempotency_key`).
const { message_id, idempotency_key } = await postles.transactional.send({
  idempotency_key: idempotencyKey("password-reset", user.id), // optional
  channel: "email",
  to: { email: "user@example.com", locale: "en" },
  content: { template: "password-reset" },
  user: { reset_url: resetUrl },
})

// Look up its state.
const message = await postles.transactional.getMessage(message_id)
```

## API

Endpoints are grouped into namespaces on the client.

### `transactional`

```ts
postles.transactional.send(request) // one message
postles.transactional.sendBatch(request) // up to 1,000 messages
postles.transactional.getMessage(id) // message state + timestamps
```

`sendBatch` accepts shared defaults alongside a `messages` array; each message
inherits the defaults unless it overrides them (`user`/`metadata` shallow-merge,
message keys win). Results are returned in input order with a per-item status
(`queued` / `replayed` / `rejected`), so a single bad recipient does not fail the
whole batch.

#### Idempotency

`idempotency_key` is optional. Omit it and the SDK generates one per call and
returns it on the result (`send`) or in each item's result (`sendBatch`), so you
can always store or correlate it. A generated key is unique per call, so it does
**not** dedupe retries — when you need retry-safety, pass your own stable key
(e.g. via `idempotencyKey(...)` derived from a domain event id).

#### Streams

`stream` is optional and defaults to `transactional`. It sets the
compliance/suppression scope of the send:

- `transactional` — 1:1 mail the recipient expects (receipts, password resets,
  OTPs); bypasses broadcast-scope unsubscribes so it always delivers.
- `broadcast` — bulk/marketing mail; respects broadcast-scope unsubscribes and
  bulk-sender compliance rules.

Most sends are transactional, so you can leave it off. Set `stream: "broadcast"`
for marketing/newsletter mail.

#### Content

`content` is one of:

- `{ template: "key", locale? }` — a stored template.
- inline fields — `subject`/`html`/`text`/`from` for email, `text` for SMS,
  `title`/`body`/`custom` for push, `method`/`headers`/`body` for webhook.
  Variables come from `user` as `{{user.*}}` and the content is compiled as
  Handlebars. Set the optional `pre_rendered: true` (defaults to `false`) to send
  already-rendered content as-is with no compilation.

The `channel` also narrows the required `to` field at compile time — an `email`
send must supply `to.email`, a `text` send `to.phone`, and so on.

### `suppressions`

```ts
postles.suppressions.list({ address, channel })
postles.suppressions.create({ channel, address, reason })
postles.suppressions.delete({ channel, address, stream })
```

> These endpoints are typed ahead of server support and will return `404` until
> they are available.

## Webhooks

Verify the `X-Postles-Signature` header against the **raw** request body (before
JSON parsing).

```ts
import { verifyWebhook } from "@postles/node"

const event = verifyWebhook({
  payload: rawBody, // string | Buffer — the exact bytes received
  signature: req.headers["x-postles-signature"],
  secret: process.env.POSTLES_WEBHOOK_SECRET!,
})
// `event` is a typed WebhookEvent; throws WebhookVerificationError on failure.
```

The timestamp freshness window bounds how long a captured delivery stays
replayable — it is **not** strict replay protection: a delivery replayed inside
the window still verifies. For exactly-once handling, dedupe on a
processed-delivery id (e.g. `message_id` + `occurred_at`) in addition to this
check.

## Errors

Non-2xx responses throw a `PostlesError` subclass: `PostlesValidationError`
(422/413), `PostlesRateLimitError` (429, with `retryAfterSeconds`),
`PostlesAuthError` (401/403), `PostlesNotFoundError` (404).

## Validating the library

Two ways to check the SDK works, depending on whether you have credentials.

**No account needed** — an end-to-end smoke check runs the built client against
an in-process mock of the API (send, batch, message lookup, webhook verify):

```sh
npm install
npm run smoke
```

**Against the real API** — send a message with your own key and watch its state:

```sh
POSTLES_BASE_URL=https://api.postles.com/v1 \
POSTLES_API_KEY=sk_... \
POSTLES_TO=you@example.com \
npm run example:send
```

The same credentials enable the live integration test in
`src/integration.test.ts` (skipped otherwise).

## Development

```sh
npm install
npm run build      # tsup → dist (ESM + CJS + types)
npm run typecheck
npm test           # vitest
npm run format
```

The published SDK supports **Node 18+**. The dev/test tooling (Vitest, which
depends on Vite) requires **Node 20.19+**, so CI runs the test suite on Node 20
and 22 and separately verifies that the package typechecks and builds on Node 18.

## Releasing

Publishing is automated (`.github/workflows/publish.yml`): push a `vX.Y.Z` tag and
the workflow builds and publishes `@postles/node` to npm.

```sh
git tag v0.1.0
git push origin v0.1.0
```

The repo needs an `NPM_TOKEN` secret (an npm automation token with publish access
to the `@postles` scope).

## License

MIT
