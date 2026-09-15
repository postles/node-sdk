import { type HttpClient } from "../http"
import {
  type DeleteSuppressionParams,
  type ListSuppressionsParams,
  type Suppression,
  type SuppressionDeleted,
} from "../types"

/**
 * The compliance suppression list: addresses that may no longer be contacted.
 *
 * @remarks Rows are written by the platform (a hard bounce, a complaint, an
 * inbound STOP, or a one-click unsubscribe), never by a caller, so this
 * resource reads and clears but does not create.
 */
export class SuppressionsApi {
  constructor(private readonly http: HttpClient) {}

  /** Look up the suppressions recorded for an address, oldest first. */
  async list(params: ListSuppressionsParams): Promise<Suppression[]> {
    return this.http.request<Suppression[]>({
      method: "GET",
      path: "/suppressions",
      query: { address: params.address, channel: params.channel },
    })
  }

  /** Remove suppressions for an address, optionally scoped to one topic. */
  async delete(params: DeleteSuppressionParams): Promise<SuppressionDeleted> {
    return this.http.request<SuppressionDeleted>({
      method: "DELETE",
      path: "/suppressions",
      query: {
        address: params.address,
        channel: params.channel,
        subscription_id: params.subscription_id,
      },
    })
  }
}
