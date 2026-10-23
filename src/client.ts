import { type PostlesConfig } from "./config"
import { HttpClient } from "./http"
import { GlobalsApi } from "./resources/globals"
import { SuppressionsApi } from "./resources/suppressions"
import { TransactionalApi } from "./resources/transactional"

export class PostlesClient {
  /** Transactional / broadcast sends: `send`, `sendBatch`, `getMessage`. */
  readonly transactional: TransactionalApi
  /** Compliance suppression list (awaiting server support). */
  readonly suppressions: SuppressionsApi
  readonly globals: GlobalsApi

  constructor(config: PostlesConfig) {
    const http = new HttpClient(config)
    this.transactional = new TransactionalApi(http)
    this.suppressions = new SuppressionsApi(http)
    this.globals = new GlobalsApi(http)
  }
}
