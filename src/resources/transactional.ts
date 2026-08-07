import { type HttpClient } from "../http"
import {
  type BatchSendRequest,
  type BatchSendResult,
  type Message,
  type SendAccepted,
  type SendRequest,
} from "../types"

/** The transactional / broadcast send surface. */
export class TransactionalApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Enqueue a single message. Resolves to the accepted message, or the existing
   * message on an idempotent replay.
   */
  async send(request: SendRequest): Promise<SendAccepted> {
    return this.http.request<SendAccepted>({
      method: "POST",
      path: "/send",
      body: request,
    })
  }

  /**
   * Enqueue up to 1,000 messages in one call. Returns per-item results in input
   * order; a single bad item is `rejected` rather than failing the whole batch.
   */
  async sendBatch(request: BatchSendRequest): Promise<BatchSendResult> {
    return this.http.request<BatchSendResult>({
      method: "POST",
      path: "/send/batch",
      body: request,
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
