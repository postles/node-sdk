import { describe, expect, it } from "vitest"

import { PostlesClient } from "./client"
import {
  PostlesAuthError,
  PostlesError,
  PostlesNotFoundError,
  PostlesRateLimitError,
  PostlesValidationError,
} from "./errors"
import { type Content, type SendRequest } from "./types"

interface Recorded {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

const recorder = (respond: (recorded: Recorded) => Response) => {
  const calls: Recorded[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    const recorded: Recorded = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(recorded)
    return respond(recorded)
  }
  return { fetch, calls }
}

const client = (
  fetchImpl: typeof globalThis.fetch,
  baseUrl = "https://api.postles.com/v1",
) => new PostlesClient({ baseUrl, apiKey: "sk_test_123", fetch: fetchImpl })

describe("Content typing", () => {
  it("rejects mixing a template with inline / pre-rendered content at compile time", () => {
    // @ts-expect-error template content cannot also carry inline fields
    const withInline: Content = { template: "welcome", subject: "hi" }
    // @ts-expect-error template content cannot be pre-rendered
    const withPreRendered: Content = { template: "welcome", pre_rendered: true }
    expect(withInline).toBeTruthy()
    expect(withPreRendered).toBeTruthy()
  })
})

describe("transactional.send", () => {
  it("posts the request verbatim with auth and content headers", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse({ message_id: "msg_1", state: "queued" }, 202),
    )
    const request: SendRequest = {
      idempotency_key: "app-pwreset-8f3a2c",
      channel: "email",
      stream: "transactional",
      to: { email: "a@example.com", locale: "en", timezone: "America/Chicago" },
      content: { template: "password-reset", locale: "en" },
      user: { reset_url: "https://app.example.com/r/abc" },
      metadata: { app: "example" },
    }

    const result = await client(fetch).transactional.send(request)

    expect(result).toEqual({
      message_id: "msg_1",
      state: "queued",
      idempotency_key: "app-pwreset-8f3a2c",
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("https://api.postles.com/v1/send")
    expect(calls[0]!.method).toBe("POST")
    expect(calls[0]!.headers.authorization).toBe("Bearer sk_test_123")
    expect(calls[0]!.headers["content-type"]).toBe("application/json")
    expect(calls[0]!.body).toEqual(request)
  })

  it("shapes each channel / content mode by passing the body through unchanged", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse({ message_id: "msg_x", state: "queued" }, 202),
    )
    const c = client(fetch)

    const requests: SendRequest[] = [
      {
        idempotency_key: "k-email-inline",
        channel: "email",
        stream: "broadcast",
        to: { email: "a@example.com" },
        content: {
          subject: "Welcome, {{user.firstName}}",
          html: "<h1>Hi {{user.firstName}}</h1>",
          from: { name: "Example", address: "hello@example.com" },
        },
        user: { firstName: "Sam" },
        unsubscribe: { preferences_url: "https://app.example.com/prefs" },
      },
      {
        idempotency_key: "k-text-pre",
        channel: "text",
        to: { phone: "+15555550123" },
        content: { pre_rendered: true, text: "Your code is 558213" },
      },
      {
        idempotency_key: "k-push",
        channel: "push",
        to: { tokens: [{ token: "fJ8x", os: "ios" }] },
        content: { title: "Order shipped", body: "On its way" },
      },
      {
        idempotency_key: "k-webhook",
        channel: "webhook",
        to: { url: "https://hooks.example.com/postles" },
        content: { method: "POST", body: '{ "ok": true }' },
      },
    ]

    for (const request of requests) await c.transactional.send(request)

    expect(calls.map((call) => call.body)).toEqual(requests)
  })

  it("generates an idempotency_key when omitted and returns the one used", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse({ message_id: "msg_gen", state: "queued" }, 202),
    )
    const result = await client(fetch).transactional.send({
      channel: "email",
      to: { email: "a@example.com" },
      content: { pre_rendered: true, html: "<p>hi</p>" },
    })
    const sentKey = (calls[0]!.body as { idempotency_key?: string })
      .idempotency_key
    expect(typeof sentKey).toBe("string")
    expect(sentKey).toBeTruthy()
    expect(result.idempotency_key).toBe(sentKey)
    expect(result.message_id).toBe("msg_gen")
  })

  it("keeps a caller-supplied idempotency_key as-is", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse({ message_id: "m", state: "queued" }, 202),
    )
    const result = await client(fetch).transactional.send({
      idempotency_key: "mine-123",
      channel: "email",
      to: { email: "a@example.com" },
      content: { pre_rendered: true, html: "<p>hi</p>" },
    })
    expect(
      (calls[0]!.body as { idempotency_key: string }).idempotency_key,
    ).toBe("mine-123")
    expect(result.idempotency_key).toBe("mine-123")
  })

  it("normalizes a trailing slash on the base URL", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse({ message_id: "m", state: "queued" }, 202),
    )
    await client(fetch, "https://api.postles.com/v1/").transactional.send({
      idempotency_key: "k",
      channel: "email",
      to: { email: "a@example.com" },
      content: { pre_rendered: true, html: "<p>hi</p>" },
    })
    expect(calls[0]!.url).toBe("https://api.postles.com/v1/send")
  })
})

describe("transactional.sendBatch", () => {
  it("posts messages with shared defaults to /send/batch", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse(
        {
          results: [
            { idempotency_key: "a", status: "queued", message_id: "msg_a" },
            {
              idempotency_key: "b",
              status: "rejected",
              message_id: null,
              error: { message: "bad" },
            },
          ],
        },
        202,
      ),
    )

    const result = await client(fetch).transactional.sendBatch({
      channel: "email",
      content: { template: "digest" },
      messages: [
        { idempotency_key: "a", to: { email: "a@example.com" } },
        { idempotency_key: "b", to: { email: "b@example.com" } },
      ],
    })

    expect(calls[0]!.url).toBe("https://api.postles.com/v1/send/batch")
    expect(calls[0]!.method).toBe("POST")
    expect(result.results).toHaveLength(2)
    expect(result.results[1]!.status).toBe("rejected")
  })

  it("fills a generated idempotency_key on batch items that omit one", async () => {
    const { fetch, calls } = recorder(() => jsonResponse({ results: [] }, 202))
    await client(fetch).transactional.sendBatch({
      channel: "email",
      content: { template: "digest" },
      messages: [
        { to: { email: "a@example.com" } },
        { idempotency_key: "b", to: { email: "b@example.com" } },
      ],
    })
    const sent = calls[0]!.body as {
      messages: Array<{ idempotency_key?: string }>
    }
    expect(sent.messages[0]!.idempotency_key).toBeTruthy()
    expect(sent.messages[1]!.idempotency_key).toBe("b")
  })
})

describe("transactional.getMessage", () => {
  it("GETs the message by encoded id", async () => {
    const { fetch, calls } = recorder(() =>
      jsonResponse({ message_id: "msg 1", state: "sent", channel: "email" }),
    )
    const message = await client(fetch).transactional.getMessage("msg 1")
    expect(calls[0]!.method).toBe("GET")
    expect(calls[0]!.url).toBe("https://api.postles.com/v1/messages/msg%201")
    expect(message.state).toBe("sent")
  })
})

describe("suppressions.delete", () => {
  it("builds the query string and tolerates a 204 with no body", async () => {
    const { fetch, calls } = recorder(() => new Response(null, { status: 204 }))
    await client(fetch).suppressions.delete({
      channel: "email",
      address: "a@example.com",
      stream: "all",
    })
    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe("/v1/suppressions")
    expect(url.searchParams.get("channel")).toBe("email")
    expect(url.searchParams.get("address")).toBe("a@example.com")
    expect(url.searchParams.get("stream")).toBe("all")
    expect(calls[0]!.method).toBe("DELETE")
  })
})

describe("error mapping", () => {
  const failing = (
    status: number,
    body: unknown,
    headers?: Record<string, string>,
  ) => client(recorder(() => jsonResponse(body, status, headers)).fetch)

  it("maps 422 to PostlesValidationError", async () => {
    const c = failing(422, { status: "error", error: "channel is required" })
    await expect(
      c.transactional.send({ idempotency_key: "k" } as unknown as SendRequest),
    ).rejects.toMatchObject({
      name: "PostlesValidationError",
      status: 422,
      message: "channel is required",
    })
    await expect(c.transactional.getMessage("x")).rejects.toBeInstanceOf(
      PostlesValidationError,
    )
  })

  it("maps 429 to PostlesRateLimitError and reads Retry-After", async () => {
    const c = failing(
      429,
      { status: "error", error: "Rate limit exceeded." },
      { "Retry-After": "12" },
    )
    const error = await c.transactional.getMessage("x").catch((e) => e)
    expect(error).toBeInstanceOf(PostlesRateLimitError)
    expect((error as PostlesRateLimitError).retryAfterSeconds).toBe(12)
  })

  it("maps 401 and 404 to their error classes", async () => {
    await expect(
      failing(401, {
        status: "error",
        error: "bad key",
      }).transactional.getMessage("x"),
    ).rejects.toBeInstanceOf(PostlesAuthError)
    await expect(
      failing(404, {
        status: "error",
        error: "not found",
      }).transactional.getMessage("x"),
    ).rejects.toBeInstanceOf(PostlesNotFoundError)
  })

  it("parses a structured error object with a code", async () => {
    const c = failing(422, {
      status: "error",
      error: { code: "invalid_channel", message: "nope" },
    })
    const error = await c.transactional.getMessage("x").catch((e) => e)
    expect(error).toBeInstanceOf(PostlesValidationError)
    expect((error as PostlesValidationError).code).toBe("invalid_channel")
    expect((error as PostlesValidationError).message).toBe("nope")
  })

  it("wraps a transport failure in a PostlesError with status 0", async () => {
    const fetch: typeof globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED")
    }
    const error = await client(fetch)
      .transactional.getMessage("x")
      .catch((e) => e)
    expect(error).toBeInstanceOf(PostlesError)
    expect((error as PostlesError).status).toBe(0)
  })
})

describe("response parsing", () => {
  const bodied = (text: string) =>
    client(
      recorder(
        () =>
          new Response(text, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ).fetch,
    )

  it("throws a PostlesError (preserving status) on a 2xx with an empty body", async () => {
    const error = await bodied("")
      .transactional.getMessage("x")
      .catch((e) => e)
    expect(error).toBeInstanceOf(PostlesError)
    expect((error as PostlesError).status).toBe(200)
  })

  it("throws a PostlesError on a 2xx with a malformed JSON body", async () => {
    const error = await bodied("not json")
      .transactional.getMessage("x")
      .catch((e) => e)
    expect(error).toBeInstanceOf(PostlesError)
    expect((error as PostlesError).status).toBe(200)
  })
})
