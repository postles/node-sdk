/** Types for the Postles send API. */

/** Channels the send API accepts. */
export type Channel = "email" | "text" | "push" | "webhook"

/**
 * Delivery stream. `transactional` is exempt from `broadcast`-only suppressions;
 * `broadcast` respects them.
 */
export type Stream = "transactional" | "broadcast"

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

/** A stored template referenced by key. */
export interface TemplateContent {
  template: string
  locale?: string
}

/**
 * Inline channel-shaped Handlebars content; variables come from `user` (`{{user.*}}`).
 * Shape varies by channel (email → subject/html/text/from; text → text;
 * push → title/body/custom; webhook → method/headers/body).
 */
export interface InlineContent {
  subject?: string
  html?: string
  text?: string
  title?: string
  body?: string
  from?: { name?: string; address?: string }
  [key: string]: unknown
}

/** Caller-rendered content; passed through without Handlebars compilation. */
export interface PreRenderedContent {
  pre_rendered: true
  subject?: string
  html?: string
  text?: string
  title?: string
  body?: string
  [key: string]: unknown
}

/** One of a stored-template reference, inline Handlebars content, or pre-rendered content. */
export type Content = TemplateContent | InlineContent | PreRenderedContent

/** Fields shared by every single-send request, independent of channel. */
export interface SendRequestBase {
  /** Required; unique per project. A replay returns the existing message. */
  idempotency_key: string
  /** Optional; defaults to the project's default provider for the channel. */
  provider_id?: number
  stream?: Stream
  content: Content
  /** Template variables, exposed as the `{{user.*}}` namespace. */
  user?: Record<string, unknown>
  /** Optional future send time (ISO 8601). */
  not_before?: string
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
  idempotency_key: string
  to: Recipient
  channel?: Channel
  provider_id?: number
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
  stream?: Stream
  priority?: Priority
  metadata?: Record<string, unknown>
  not_before?: string | null
  sent_at?: string | null
  result?: Record<string, unknown> | null
  error?: ErrorDetail
  events?: MessageEvent[]
  created_at?: string
  updated_at?: string
}

export type SuppressionStream = "all" | "broadcast"

export type SuppressionReason =
  "hard_bounce" | "complaint" | "one_click" | "manual" | "api"

export interface Suppression {
  id: number
  project_id: number
  channel: Channel
  /** Normalized (lowercase email / E.164 phone). */
  address: string
  stream: SuppressionStream
  reason: SuppressionReason
  source_message_id?: string | null
  context?: Record<string, unknown>
  created_at: string
}

/** Query for listing suppressions. */
export interface ListSuppressionsParams {
  address?: string
  channel?: Channel
}

/** Body for adding a suppression. `reason` is constrained to `api`/`manual`. */
export interface CreateSuppressionRequest {
  channel: Channel
  address: string
  stream?: SuppressionStream
  reason?: "api" | "manual"
  context?: Record<string, unknown>
}

/** Query for removing a suppression. */
export interface DeleteSuppressionParams {
  address: string
  channel: Channel
  stream?: SuppressionStream
}

export interface ListSuppressionsResult {
  results: Suppression[]
}

/** The event type of an outbound webhook. */
export type WebhookEventType =
  | "message.sent"
  | "message.failed"
  | "message.suppressed"
  | "message.bounced"
  | "message.complained"
  | "message.delivered"
  | "message.opened"
  | "message.clicked"
  | "suppression.created"
  | "suppression.deleted"

/** Body of an outbound webhook POST. */
export interface WebhookEvent {
  event: WebhookEventType
  project_id: number
  occurred_at: string
  /** Absent for `suppression.*` events with no source message. */
  message_id?: string | null
  channel?: Channel
  /** Recipient; redaction configurable per endpoint. */
  to?: string | Recipient
  stream?: Stream
  metadata?: Record<string, unknown>
  context?: Record<string, unknown>
}

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
