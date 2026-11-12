import { Array, Effect, Layer, Option, pipe, Predicate, Schema as S } from "effect"
import { HttpClient, HttpClientError } from "effect/http"

const connectionError = S.Struct({
  code: S.String.pipe(S.optional),
  message: S.String.pipe(S.optional)
})
const nativeError = S.Struct({
  ...connectionError.fields,
  errors: S.Array(connectionError).pipe(S.optional)
})

export const layer = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return client.pipe(
      HttpClient.catchTags({
        HttpClientError: Effect.fn("TraitsHttpClient.transportError")(function* (error) {
          const { reason } = error
          if (reason._tag !== "TransportError") return yield* error
          const native = pipe(
            reason.cause,
            S.decodeUnknownOption(S.Struct({ ...nativeError.fields, cause: nativeError.pipe(S.optional) })),
            Option.getOrUndefined
          )
          const description = pipe(
            [native, native?.cause, ...(native?.errors ?? []), ...(native?.cause?.errors ?? [])],
            Array.filter(Predicate.isNotUndefined),
            Array.flatMap((error) => [error.code, error.message]),
            Array.filter(Predicate.isNotUndefined),
            Array.join("\n")
          )
          if (description === "") return yield* error
          return yield* new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request: reason.request,
              cause: reason.cause,
              description
            })
          })
        })
      })
    )
  })
)
