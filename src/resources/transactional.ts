import { randomUUID } from "node:crypto"

import { type HttpClient } from "../http"
import {
  type BatchSendRequest,
  type BatchSendResult,
  type Message,
  type SendAccepted,
  type SendRequest,
  type SendResult,
} from "../types"

/** The transactional / broadcast send surface. */
export class TransactionalApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Enqueue a single message. `idempotency_key` is optional — if you omit it the
   * SDK generates one; either way the key used is returned on the result so you
   * can store or correlate it. Resolves to the accepted message, or the existing
   * message on an idempotent replay.
   */
  async send(request: SendRequest): Promise<SendResult> {
    const idempotency_key = request.idempotency_key ?? randomUUID()
    const accepted = await this.http.request<SendAccepted>({
      method: "POST",
      path: "/send",
      body: { ...request, idempotency_key },
    })
    return { ...accepted, idempotency_key }
  }

  /**
   * Enqueue up to 1,000 messages in one call. Any message without an
   * `idempotency_key` is assigned a generated one before sending; each key is
   * echoed back in the corresponding result. Returns per-item results in input
   * order; a single bad item is `rejected` rather than failing the whole batch.
   */
  async sendBatch(request: BatchSendRequest): Promise<BatchSendResult> {
    const messages = request.messages.map((message) => ({
      ...message,
      idempotency_key: message.idempotency_key ?? randomUUID(),
    }))
    return this.http.request<BatchSendResult>({
      method: "POST",
      path: "/send/batch",
      body: { ...request, messages },
    })
  }

  /** Fetch a message by its id. */
  async getMessage(id: string): Promise<Message> {
    return this.http.request<Message>({
      method: "GET",
      path: `/messages/${encodeURIComponent(id)}`,
    })
  }
}
