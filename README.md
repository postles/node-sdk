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

// Send one message. Idempotent on `idempotency_key` — derive it from a domain
// event id so retries collapse onto the same message instead of sending twice.
const { message_id } = await postles.transactional.send({
  idempotency_key: idempotencyKey("password-reset", user.id),
  channel: "email",
  stream: "transactional",
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

#### Content

`content` is one of:

- `{ template: "key", locale? }` — a stored template.
- inline Handlebars fields — `subject`/`html`/`text`/`from` for email, `text` for
  SMS, `title`/`body`/`custom` for push, `method`/`headers`/`body` for webhook;
  variables come from `user` as `{{user.*}}`.
- `{ pre_rendered: true, … }` — already-rendered content, sent as-is.

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

## Development

```sh
npm install
npm run build      # tsup → dist (ESM + CJS + types)
npm run typecheck
npm test           # vitest
npm run format
```

The integration test in `src/integration.test.ts` is skipped unless
`POSTLES_BASE_URL` and `POSTLES_API_KEY` are set.

## License

MIT
