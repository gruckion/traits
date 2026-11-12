import { expect, it } from "@effect/vitest"
import { Effect, pipe, Result, Schema as S } from "effect"

import * as TraitsConfig from "../TraitsConfig.ts"

it.effect(
  "defaults to bounded file reads and validates explicit concurrency overrides",
  Effect.fn("test.TraitsConfig.fileReadConcurrency")(function* () {
    const decode = S.decodeUnknownEffect(
      S.Struct({ fileReadConcurrency: TraitsConfig.TraitsConfig.fields.fileReadConcurrency })
    )
    const defaults = yield* decode({})
    expect(defaults.fileReadConcurrency).toBe(16)
    for (const fileReadConcurrency of [1, 8, 32, "unbounded"]) {
      const config = yield* decode({ fileReadConcurrency })
      expect(config.fileReadConcurrency).toBe(fileReadConcurrency)
    }
    for (const fileReadConcurrency of [0, -1, 1.5, Infinity, NaN, "16", null]) {
      const result = yield* decode({ fileReadConcurrency }).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  })
)

it.effect(
  "accepts unbounded or positive integer decision concurrency while retaining the default",
  Effect.fn("test.TraitsConfig.decisionConcurrency")(function* () {
    const decode = S.decodeUnknownEffect(
      S.Struct({
        decisionConcurrency: TraitsConfig.TraitsConfig.fields.decisionConcurrency
      })
    )
    const defaults = yield* decode({})
    expect(defaults.decisionConcurrency).toBe(4)
    for (const decisionConcurrency of [1, 8, "unbounded"]) {
      const config = yield* decode({ decisionConcurrency })
      expect(config.decisionConcurrency).toBe(decisionConcurrency)
    }
    for (const decisionConcurrency of [0, -1, 1.5, Infinity, NaN, "8", "UNBOUNDED", null]) {
      const result = yield* pipe(decode({ decisionConcurrency }), Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  })
)
