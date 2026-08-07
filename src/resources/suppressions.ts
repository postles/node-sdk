import { type HttpClient } from "../http"
import {
  type CreateSuppressionRequest,
  type DeleteSuppressionParams,
  type ListSuppressionsParams,
  type ListSuppressionsResult,
  type Suppression,
} from "../types"

/**
 * The compliance suppression list.
 *
 * @remarks Not yet available on the API — these methods are typed ahead of
 * server support and will return 404 until the endpoints ship.
 */
export class SuppressionsApi {
  constructor(private readonly http: HttpClient) {}

  /** List / look up suppressions. */
  async list(
    params: ListSuppressionsParams = {},
  ): Promise<ListSuppressionsResult> {
    return this.http.request<ListSuppressionsResult>({
      method: "GET",
      path: "/suppressions",
      query: { address: params.address, channel: params.channel },
    })
  }

  /** Add a manual/API suppression. */
  async create(request: CreateSuppressionRequest): Promise<Suppression> {
    return this.http.request<Suppression>({
      method: "POST",
      path: "/suppressions",
      body: request,
    })
  }

  /** Remove a suppression. */
  async delete(params: DeleteSuppressionParams): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: "/suppressions",
      query: {
        address: params.address,
        channel: params.channel,
        stream: params.stream,
      },
      expectBody: false,
    })
  }
}
