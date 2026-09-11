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

#### Consent

Two optional fields tie a send to the consent the recipient has already given:

- `external_user_id` — the `external_id` of a project user. Their subscription
  state decides whether the message goes out, and their stored profile fills in
  any `{{user.*}}` variable the request does not set. `to` is still required.
- `subscription_id` — the subscription topic the send belongs to. Checked
  against the named user's preferences, or against the suppression list for the
  `to` address when there is no user.

An email send that names a `subscription_id` carries `List-Unsubscribe` and the
RFC 8058 one-click headers, so mail clients show their own Unsubscribe button,
and the `{{unsubscribeEmailUrl}}` / `{{preferencesUrl}}` template helpers
resolve. A send with neither field is delivered without any consent check beyond
the suppression list for the address.

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

#### SMS opt-out footer

Carriers require STOP instructions in text messages. API sends never add them on
their own, so ask for one with `opt_out` on text `content`:

```ts
await postles.transactional.send({
  channel: "text",
  to: { phone: "+15555550123" },
  content: { template: "otp-code", opt_out: "first" },
  user: { code: "558213" },
})
```

`first` appends the long carrier-mandated first-contact copy, `regular` the short
recurring reminder, and `none` (the default) appends nothing. The wording comes
from your project settings for the recipient's locale, so the request never carries
opt-out text. If the project has nothing configured the message still sends, just
without a footer. `opt_out` works with stored templates, inline content, and
pre-rendered content, and is ignored on non-text channels. Remember that the footer
counts toward the 160-character SMS segment limit.

### `suppressions`

```ts
postles.suppressions.list({ address, channel })
postles.suppressions.delete({ channel, address, subscription_id })
```

`list` returns every suppression stored for the address, oldest first; an empty
array means the address is not suppressed. A row with a `subscription_id`
suppresses only sends naming that topic, one without suppresses the whole
channel. `delete` returns `{ deleted }`, the number of rows removed, and clears
every row for the address on the channel unless you scope it to one topic.

> Rows are written by the platform — a hard bounce, a spam complaint, an inbound
> STOP, or a one-click unsubscribe — never by a caller, so there is no create
> method. Clear a row only when the recipient has asked to be contacted again.

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
the window still verifies. Every body carries an `id` that is unique to the
delivery; deliveries are at least once, so dedupe on `id` in addition to this
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

CI (`.github/workflows/ci.yml`) runs format-check, typecheck, tests, and build on
Node 18 and 20 for every push and pull request to `main`.

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
