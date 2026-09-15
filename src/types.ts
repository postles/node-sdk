/** Types for the Postles send API. */

/** Channels the send API accepts. */
export type Channel = "email" | "text" | "push" | "webhook"

/** Send priority; defaults to `high`. */
export type Priority = "high" | "normal" | "low"

/**
 * Lifecycle state of a message.
 * Happy path: queued → sending → sent → (delivered | bounced).
 * Terminal: failed, suppressed, aborted. Transient: throttled, delayed.
 */
export type MessageState =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "suppressed"
  | "aborted"
  | "throttled"
  | "delayed"

/** Push device token as supplied inline by a caller. */
export interface DeviceToken {
  token: string
  os?: string
}

/** Fields common to every recipient, regardless of channel. */
export interface RecipientBase {
  /** IANA timezone; optional. */
  timezone?: string
  /** Template variant selection; optional. */
  locale?: string
}

export interface EmailRecipient extends RecipientBase {
  email: string
}

export interface TextRecipient extends RecipientBase {
  /** E.164, e.g. +15555550123. */
  phone: string
}

export interface PushRecipient extends RecipientBase {
  tokens: DeviceToken[]
}

export interface WebhookRecipient extends RecipientBase {
  url: string
}

/**
 * Generic recipient with all channel fields optional — used for batch items
 * (whose channel may come from batch defaults) and for API responses. Single
 * sends use the channel-specific recipient tied to {@link SendRequest}.
 */
export interface Recipient extends RecipientBase {
  email?: string
  phone?: string
  tokens?: DeviceToken[]
  url?: string
}

/**
 * Which of the project's two configured SMS opt-out messages to append to a text
 * send. `first` is the long carrier-mandated first-contact copy, `regular` the
 * short recurring reminder, `none` (the default) appends nothing. The wording
 * itself comes from the project's settings, never from the request.
 */
export type TextOptOut = "none" | "first" | "regular"

/** A stored template referenced by key. */
export interface TemplateContent {
  template: string
  locale?: string
  /** Text sends only; ignored on other channels. See {@link TextOptOut}. */
  opt_out?: TextOptOut
  /** Disjointness marker: template content is never pre-rendered. */
  pre_rendered?: never
}

/**
 * Inline content; variables come from `user` (`{{user.*}}`). Shape varies by
 * channel (email → subject/html/text/from; text → text; push → title/body/custom;
 * webhook → method/headers/body).
 *
 * By default the content is compiled as Handlebars. Set `pre_rendered: true` to
 * send it as-is (no compilation) — e.g. when you have already rendered the HTML.
 */
export interface InlineContent {
  /** Disjointness marker: inline content does not carry a template key. */
  template?: never
  /** When true, send the content as-is without Handlebars compilation. Defaults to false. */
  pre_rendered?: boolean
  subject?: string
  html?: string
  text?: string
  title?: string
  body?: string
  from?: { name?: string; address?: string }
  /** Text sends only; ignored on other channels. See {@link TextOptOut}. */
  opt_out?: TextOptOut
  [key: string]: unknown
}

/** A stored template referenced by key, or inline content. */
export type Content = TemplateContent | InlineContent

/** Fields shared by every single-send request, independent of channel. */
export interface SendRequestBase {
  /**
   * Optional; unique per project. If omitted, the SDK generates one and returns
   * it on the result. Pass your own — derived from a domain event id via
   * {@link idempotencyKey} — when you need retry-safety, since a generated key is
   * unique per call and so does not dedupe retries.
   */
  idempotency_key?: string
  /** Optional; defaults to the project's default provider for the channel. */
  provider_id?: number
  /**
   * Optional; the `external_id` of a project user this send is for. Their
   * subscription state decides whether the message goes out, and their stored
   * profile fills in any `{{user.*}}` variable the request does not set. `to`
   * is still required.
   */
  external_user_id?: string
  /**
   * Optional; the subscription topic this send belongs to. Checked against the
   * named user's preferences, or against the suppression list for the `to`
   * address. Required for the send to carry an unsubscribe link.
   */
  subscription_id?: number
  content: Content
  /** Template variables, exposed as the `{{user.*}}` namespace. */
  user?: Record<string, unknown>
  priority?: Priority
  unsubscribe?: { preferences_url?: string }
  /** Opaque; echoed verbatim in webhook payloads. */
  metadata?: Record<string, unknown>
}

export interface EmailSendRequest extends SendRequestBase {
  channel: "email"
  to: EmailRecipient
}

export interface TextSendRequest extends SendRequestBase {
  channel: "text"
  to: TextRecipient
}

export interface PushSendRequest extends SendRequestBase {
  channel: "push"
  to: PushRecipient
}

export interface WebhookSendRequest extends SendRequestBase {
  channel: "webhook"
  to: WebhookRecipient
}

/**
 * Request body for a single send. Discriminated on `channel` so the required
 * recipient field is checked at compile time (e.g. an `email` send must supply
 * `to.email`).
 */
export type SendRequest =
  EmailSendRequest | TextSendRequest | PushSendRequest | WebhookSendRequest

/**
 * One message in a batch. Only the per-recipient identity (`idempotency_key`, `to`)
 * is required; other fields may be supplied here or inherited from batch-level
 * defaults, so `channel` is optional and the recipient is the generic shape.
 */
export interface BatchMessage {
  /** Optional; the SDK fills any omitted key with a generated one before sending. */
  idempotency_key?: string
  to: Recipient
  channel?: Channel
  provider_id?: number
  external_user_id?: string
  subscription_id?: number
  content?: Content
  user?: Record<string, unknown>
  priority?: Priority
  unsubscribe?: { preferences_url?: string }
  metadata?: Record<string, unknown>
}

/**
 * Batch-level defaults applied to every message unless the message overrides them.
 * `user`/`metadata` shallow-merge (message keys win); other fields are replaced outright.
 */
export interface BatchSendRequest {
  messages: BatchMessage[]
  channel?: Channel
  provider_id?: number
  external_user_id?: string
  subscription_id?: number
  priority?: Priority
  content?: Content
  user?: Record<string, unknown>
  metadata?: Record<string, unknown>
  unsubscribe?: { preferences_url?: string }
}

/** Response body for a single send. */
export interface SendAccepted {
  message_id: string
  state: MessageState
}

/**
 * What {@link TransactionalApi.send} resolves to: the API response plus the
 * `idempotency_key` used for the send — the one you passed, or the one the SDK
 * generated for you — so it can always be stored or correlated later.
 */
export interface SendResult extends SendAccepted {
  idempotency_key: string
}

export type BatchItemStatus = "queued" | "replayed" | "rejected"

export interface BatchItemResult {
  idempotency_key: string
  status: BatchItemStatus
  message_id: string | null
  error?: ErrorDetail
}

export interface BatchSendResult {
  results: BatchItemResult[]
}

export interface MessageEvent {
  type: string
  occurred_at: string
  context?: Record<string, unknown>
}

/** Response for a message lookup. Fields the API omits are optional. */
export interface Message {
  message_id: string
  state: MessageState
  channel: Channel
  to?: Recipient
  project_id?: number
  idempotency_key?: string
  provider_id?: number | null
  priority?: Priority
  metadata?: Record<string, unknown>
  sent_at?: string | null
  result?: Record<string, unknown> | null
  error?: ErrorDetail
  events?: MessageEvent[]
  created_at?: string
  updated_at?: string
}

/** Channels an address can be suppressed on; push and webhook carry no address. */
export type SuppressionChannel = "email" | "text"

export type SuppressionReason =
  "hard_bounce" | "complaint" | "one_click" | "stop" | "manual"

export interface Suppression {
  /** Normalized (lowercase email / E.164 phone). */
  address: string
  channel: SuppressionChannel
  /** Null when the row suppresses the whole channel for the address. */
  subscription_id: number | null
  reason: SuppressionReason
  created_at: string
}

/** Query for listing suppressions. */
export interface ListSuppressionsParams {
  address: string
  channel?: SuppressionChannel
}

/** Query for removing a suppression. */
export interface DeleteSuppressionParams {
  address: string
  channel: SuppressionChannel
  /** Clear only the row scoped to this topic; every row when omitted. */
  subscription_id?: number
}

export interface SuppressionDeleted {
  deleted: number
}

/** The event type of an outbound webhook about a message. */
export type MessageEventType =
  | "message.sent"
  | "message.failed"
  | "message.suppressed"
  | "message.bounced"
  | "message.complained"
  | "message.delivered"
  | "message.opened"
  | "message.clicked"

/** The event type of an outbound webhook about a suppression. */
export type SuppressionEventType = "suppression.created" | "suppression.deleted"

/** The event type of an outbound webhook. */
export type WebhookEventType = MessageEventType | SuppressionEventType

/** Body of a `message.*` webhook POST. */
export interface MessageDelivery {
  event: MessageEventType
  /** Public id of the message; usable with {@link TransactionalApi.getMessage}. */
  message_id: string
  project_id: number
  channel: Channel
  to?: Recipient | null
  metadata?: Record<string, unknown> | null
  occurred_at: string
  /**
   * Event-specific detail. On `message.suppressed` it carries `reason`:
   * `unsubscribed` when the named user opted out, `suppressed` when the address
   * itself is on the suppression list.
   */
  context?: Record<string, unknown> | null
}

/** Body of a `suppression.*` webhook POST. A suppression is keyed by address, so these carry no `message_id`. */
export interface SuppressionDelivery {
  event: SuppressionEventType
  project_id: number
  channel: SuppressionChannel
  /** The normalized address the suppression covers. */
  address: string
  reason: SuppressionReason
  /** Null when the row covers the whole channel. */
  subscription_id: number | null
  occurred_at: string
}

/**
 * Body of an outbound webhook POST. Narrow on `event` (or on the presence of
 * `message_id`) to get the concrete shape.
 */
export type WebhookEvent = MessageDelivery | SuppressionDelivery

/** The `error` member of an API error body / batch-item error. */
export interface ErrorDetail {
  code?: string
  message: string
}

/** The API error envelope: `{ status: "error", error: string | ErrorDetail }`. */
export interface ErrorBody {
  status?: string
  error?: string | ErrorDetail
  code?: number
}
