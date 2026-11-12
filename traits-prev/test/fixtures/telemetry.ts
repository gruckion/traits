import { NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer, Logger } from "effect"
import { FetchHttpClient } from "effect/http"
import { OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/observability"

const telemetry = Layer.mergeAll(OtlpTracer.layerFromConfig(), OtlpLogger.layerFromConfig()).pipe(
  Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson])
)

Effect.gen(function* () {
  if (process.argv[3] === "wait") yield* Effect.addFinalizer(() => Effect.log("shutdown log"))
  yield* Effect.log("fixture log", { answer: 42 })
  // Let runMain install its signal handlers before announcing readiness.
  yield* Effect.yieldNow
  yield* Console.log("child stdout")
  yield* Console.error("child stderr")
  if (process.argv[3] === "wait") {
    return yield* Effect.never
  }
}).pipe(
  Effect.scoped,
  Effect.withSpan("fixture span"),
  Effect.provide(telemetry.pipe(Layer.provideMerge(Logger.layer([])))),
  NodeRuntime.runMain
)
