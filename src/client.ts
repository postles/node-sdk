import { type PostlesConfig } from "./config"
import { HttpClient } from "./http"
import { SuppressionsApi } from "./resources/suppressions"
import { TransactionalApi } from "./resources/transactional"

/**
 * Entry point for the Postles send API. Endpoints are grouped into namespaces
 * (`transactional`, `suppressions`) so new resource groups slot in without
 * crowding a single surface.
 */
export class PostlesClient {
  /** Transactional / broadcast sends: `send`, `sendBatch`, `getMessage`. */
  readonly transactional: TransactionalApi
  /** Compliance suppression list (awaiting server support). */
  readonly suppressions: SuppressionsApi

  constructor(config: PostlesConfig) {
    const http = new HttpClient(config)
    this.transactional = new TransactionalApi(http)
    this.suppressions = new SuppressionsApi(http)
  }
}
