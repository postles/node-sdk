import { type HttpClient } from "../http"
import { type GlobalData, type GlobalDataSummary } from "../types"

export class GlobalsApi {
  constructor(private readonly http: HttpClient) {}

  async set(key: string, data: unknown): Promise<GlobalData> {
    return this.http.request<GlobalData>({
      method: "PUT",
      path: `/globals/${encodeURIComponent(key)}`,
      body: { data },
    })
  }

  async get(key: string): Promise<GlobalData> {
    return this.http.request<GlobalData>({
      method: "GET",
      path: `/globals/${encodeURIComponent(key)}`,
    })
  }

  async list(): Promise<GlobalDataSummary[]> {
    return this.http.request<GlobalDataSummary[]>({
      method: "GET",
      path: "/globals",
    })
  }

  async delete(key: string): Promise<void> {
    return this.http.request<void>({
      method: "DELETE",
      path: `/globals/${encodeURIComponent(key)}`,
      expectBody: false,
    })
  }
}
