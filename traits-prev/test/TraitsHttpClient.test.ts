import { OpenRouterClient } from "@effect/ai-openrouter"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Result } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest } from "effect/http"

import * as TraitsHttpClient from "../TraitsHttpClient.ts"

it.effect(
  "preserves native connection codes and messages without copying request data through OpenRouter's conversion",
  Effect.fn("test.TraitsHttpClient.cause")(function* () {
    const transport = HttpClient.make(
      (request) =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: new TypeError("fetch failed", {
              cause: {
                name: "AggregateError",
                code: "ETIMEDOUT",
                errors: [
                  { code: "ETIMEDOUT", message: "connect ETIMEDOUT 192.0.2.1:443" },
                  { code: "ENETUNREACH", message: "connect ENETUNREACH IPv6" }
                ],
                request: { authorization: "private-token", body: "private source" }
              }
            })
          })
        })
    )
    yield* Effect.gen(function* () {
      const client = yield* OpenRouterClient.OpenRouterClient
      const result = yield* client
        .createDecisions({ model: "~typesafe/jev-latest", state: {}, questions: {} })
        .pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure.message).toContain("ETIMEDOUT")
        expect(result.failure.message).toContain("ENETUNREACH")
        expect(result.failure.message).not.toContain("private-token")
        expect(result.failure.message).not.toContain("private source")
        expect(result.failure.message).not.toContain("test-api-key")
      }
    }).pipe(
      Effect.provide(
        OpenRouterClient.layer({ apiKey: Redacted.make("test-api-key") }).pipe(
          Layer.provide(TraitsHttpClient.layer),
          Layer.provide(Layer.succeed(HttpClient.HttpClient, transport))
        )
      )
    )
  })
)

it.effect(
  "preserves non-transport errors without remapping",
  Effect.fn("test.TraitsHttpClient.preserve")(function* () {
    const request = HttpClientRequest.get("https://example.com")
    const error = new HttpClientError.HttpClientError({ reason: new HttpClientError.InvalidUrlError({ request }) })
    const result = yield* Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      return yield* client.execute(request)
    }).pipe(
      Effect.provide(
        TraitsHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make(() => error)
            )
          )
        )
      ),
      Effect.result
    )
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure).toBe(error)
  })
)
