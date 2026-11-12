import { expect, it } from "@effect/vitest"
import { Effect, pipe, Record, Result } from "effect"
import { AiError, DecisionModel } from "effect/ai"

import * as TraitAssertion from "../TraitAssertion.ts"
import { TraitBody } from "../TraitBody.ts"
import { TraitPurpose } from "../TraitPurpose.ts"
import { Input, Segment, WorkspacePath } from "../util/util.ts"

const probabilities = { pass: 0.1, fail: 0.8, na: 0.05, uncertain: 0.05 }
const input = Input.cases.After.make({
  change: { after: { path: WorkspacePath.make("file.ts"), text: "source" } },
  segment: Segment.cases.After.make({ range: { start: 0, end: 6 } })
})
const request = (text: string) =>
  TraitAssertion.TraitAssertionInput.make({
    assertion: TraitAssertion.TraitAssertion.make(text),
    context: { purpose: TraitPurpose.make("Protect correctness."), body: TraitBody.make(text) },
    enrichments: [{ _tag: "Succeeded", module: WorkspacePath.make("test/context.mjs"), text }]
  })

it.effect("batches assertions with isolated context/enrichments and preserves assessment classifications", () =>
  Effect.gen(function* () {
    const assertions = { first: request("First assertion."), second: request("Second assertion.") }
    let calls = 0
    const response = yield* pipe(
      assertions,
      TraitAssertion.evaluate(input),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (options) =>
            Effect.sync(() => {
              calls++
              expect(options.state).toEqual({ path: "file.ts", version: "after", target: "source", assertions })
              expect(options.decisions).toMatchObject({
                first: { instructions: { assertionKey: "first" } },
                second: { instructions: { assertionKey: "second" } }
              })
              for (const decision of Record.values(options.decisions)) {
                expect(decision._tag).toBe("Classify")
                if (decision._tag === "Classify") {
                  expect(Record.keys(decision.criteria)).toEqual(["pass", "fail", "na", "uncertain"])
                }
              }
              return {
                answers: Record.map(assertions, () => ({ _tag: "Classify", label: "fail", probabilities }) as const),
                usage: { inputTokens: 20, outputTokens: 8 },
                id: "assertion-batch"
              }
            })
        })
      )
    )
    expect(calls).toBe(1)
    expect(Result.getOrThrow(response.outcomes.first).probabilities).toEqual(probabilities)
    expect(Result.getOrThrow(response.outcomes.second).probabilities).toEqual(probabilities)
    expect(response.id).toBe("assertion-batch")
    expect(response.usage.inputTokens).toBe(20)
  })
)

it.effect("retains a valid assertion when a sibling is unanswered", () =>
  Effect.gen(function* () {
    const response = yield* TraitAssertion.evaluate(
      { valid: request("First."), missing: request("Second.") },
      input
    ).pipe(
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: () =>
            Effect.succeed({
              answers: { valid: { _tag: "Classify", label: "fail", probabilities } },
              usage: { inputTokens: undefined, outputTokens: undefined }
            })
        })
      )
    )
    expect(Result.getOrThrow(response.outcomes.valid).probabilities).toEqual(probabilities)
    expect(Result.isFailure(response.outcomes.missing)).toBe(true)
    if (Result.isFailure(response.outcomes.missing)) {
      expect(response.outcomes.missing.failure.reason).toBe("Missing")
    }
  })
)

it.effect("skips empty batches and preserves request-level errors", () =>
  Effect.gen(function* () {
    const failure = AiError.make({
      module: "test",
      method: "decide",
      reason: AiError.InvalidUserInputError.make({ description: "Request rejected." })
    })
    let calls = 0
    const model = yield* DecisionModel.make({
      decide: () => {
        calls++
        return failure
      }
    })
    const empty = yield* TraitAssertion.evaluate({}, input).pipe(
      Effect.provideService(DecisionModel.DecisionModel, model)
    )
    expect(empty.outcomes).toEqual({})
    expect(empty.usage.inputTokens).toBe(0)
    expect(calls).toBe(0)
    const actual = yield* TraitAssertion.evaluate({ first: request("First.") }, input).pipe(
      Effect.provideService(DecisionModel.DecisionModel, model),
      Effect.flip
    )
    expect(actual).toBe(failure)
    expect(calls).toBe(1)
  })
)
