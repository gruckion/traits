import { expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, pipe, Redacted, Result, Schema as S } from "effect"

import * as ToolExecutionError from "../ToolExecutionError.ts"
import * as TraitStore from "../TraitStore.ts"

const protect = Effect.catchCause(ToolExecutionError.fromCause)

it.effect(
  "returns domain recovery diagnostics in the shared envelope and preserves pure interruptions",
  Effect.fn("test.ToolExecutionError.preserve")(function* () {
    const error = TraitStore.TraitParseError.make({ path: "example.md", cause: "invalid YAML" })
    const result = yield* pipe(error, protect, Effect.result)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure._tag).toBe("ToolExecutionError")
      expect(result.failure.details).toContain("example.md")
      expect(result.failure.details).toContain("Recovery requires developer consent")
    }
    const interrupted = yield* Effect.interrupt.pipe(protect, Effect.exit)
    expect(Exit.isFailure(interrupted)).toBe(true)
    if (Exit.isFailure(interrupted)) expect(Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
  })
)

it.effect(
  "uses standard cause formatting and preserves source redaction without dumping Error properties",
  Effect.fn("test.ToolExecutionError.diagnostics")(function* () {
    const error = Object.assign(new Error("Connection reset", { cause: new Error("socket disconnected") }), {
      request: { headers: { authorization: Redacted.make("request-secret") }, body: "private source code" }
    })
    for (const effect of [Effect.fail(error), Effect.die(error)]) {
      const result = yield* effect.pipe(protect, Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      if (!Result.isFailure(result)) return yield* Effect.die("Expected a returned tool error")
      const encoded = yield* pipe(
        result.failure,
        S.encodeUnknownEffect(S.fromJsonString(ToolExecutionError.ToolExecutionError))
      )
      expect(encoded).toContain("ToolExecutionError")
      expect(encoded).toContain("[cause]: Error: socket disconnected")
      expect(encoded).toContain("Connection reset")
      expect(encoded).toContain("socket disconnected")
      expect(encoded).not.toContain("request-secret")
      expect(encoded).not.toContain("private source code")
    }
    const redacted = yield* Effect.fail({ apiKey: Redacted.make("api-secret") }).pipe(protect, Effect.result)
    expect(redacted).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "ToolExecutionError", details: expect.not.stringContaining("api-secret") }
    })
    const broken = {
      get message(): string {
        throw new Error("broken diagnostic getter")
      }
    }
    const failedFormatting = yield* Effect.fail(broken).pipe(protect, Effect.exit)
    expect(Exit.isFailure(failedFormatting)).toBe(true)
    if (Exit.isFailure(failedFormatting)) expect(Cause.hasDies(failedFormatting.cause)).toBe(true)
  })
)
