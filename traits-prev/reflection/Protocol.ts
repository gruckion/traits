import { Effect, pipe, Schema as S } from "effect"

export type Signal = "traces" | "logs"

export class InvalidPayload extends S.TaggedError<InvalidPayload>()("InvalidPayload", {
  cause: S.Defect()
}) {}

export const decode = Effect.fnUntraced(function* (payload: Uint8Array) {
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(payload),
    catch: (cause) => InvalidPayload.make({ cause })
  })
  return yield* pipe(text, S.decodeEffect(S.fromJsonString(S.JsonObject)))
})
