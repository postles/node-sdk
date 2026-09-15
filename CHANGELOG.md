# Changelog

## 0.1.0

Brings the SDK back in line with the send API. The removed fields were typed
ahead of the server and were never accepted by it, so a caller that passes one
today is already being ignored; TypeScript now says so.

### Added

- `external_user_id` and `subscription_id` on `SendRequest`, on a batch message
  and on the batch defaults. They tie a send to a project user's subscription
  state and to a topic, and an email send naming a topic carries the
  `List-Unsubscribe` and one-click headers.
- `MessageDelivery` and `SuppressionDelivery`, the two concrete webhook bodies.
  `WebhookEvent` is now the union of them, so a suppression delivery no longer
  appears to carry a `message_id`.
- `SuppressionChannel` and `SuppressionDeleted`.

### Removed

- `stream` on a send and `Stream` / `SuppressionStream`. The API has no delivery
  streams; consent is expressed with `subscription_id`.
- `not_before` on a send. Scheduling is not part of the API.
- `suppressions.create` and `CreateSuppressionRequest`. Suppressions are written
  by the platform (hard bounce, complaint, inbound STOP, one-click unsubscribe),
  never by a caller.
- `ListSuppressionsResult`. `suppressions.list` returns `Suppression[]`, which is
  what the endpoint actually returns.
- `id`, `project_id`, `stream`, `source_message_id` and `context` on
  `Suppression`, which now matches the response: `address`, `channel`,
  `subscription_id`, `reason`, `created_at`.

### Changed

- `suppressions.list` requires `address`, as the endpoint does.
- `suppressions.delete` takes `subscription_id` instead of `stream` and resolves
  to `{ deleted }` rather than `void`.
