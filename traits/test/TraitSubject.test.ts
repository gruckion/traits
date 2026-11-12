import { expect, it } from "@effect/vitest"
import { Effect, pipe, Record, Result } from "effect"
import { AiError, DecisionModel } from "effect/ai"

import * as TraitSubject from "../TraitSubject.ts"
import { Input, Segment, WorkspacePath } from "../util/util.ts"

const probabilities = { yes: 0.4, no: 0.35, uncertain: 0.25 }
const subject = TraitSubject.TraitSubject.make("Function declarations.")

it.effect("batches independent subjects over shared source context in one provider request", () =>
  Effect.gen(function* () {
    const subjects = { functions: subject, exports: TraitSubject.TraitSubject.make("Export declarations.") }
    let calls = 0
    const input = Input.cases.After.make({
      change: {
        before: { path: WorkspacePath.make("old.ts"), text: "😀old" },
        after: { path: WorkspacePath.make("new.ts"), text: "😀new" }
      },
      segment: Segment.cases.After.make({ range: { start: 2, end: 5 } })
    })
    const response = yield* pipe(
      subjects,
      TraitSubject.match(input),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (options) =>
            Effect.sync(() => {
              calls++
              expect(options.state).toEqual({ path: "new.ts", version: "after", target: "new", source: "😀new" })
              expect(Record.keys(options.decisions)).toEqual(["functions", "exports"])
              expect(options.decisions).toMatchObject({
                functions: { instructions: { subject: subjects.functions } },
                exports: { instructions: { subject: subjects.exports } }
              })
              for (const decision of Record.values(options.decisions)) {
                expect(decision._tag).toBe("Classify")
                if (decision._tag === "Classify") {
                  expect(Record.keys(decision.criteria)).toEqual(["yes", "no", "uncertain"])
                }
              }
              return {
                answers: Record.map(subjects, () => ({ _tag: "Classify", label: "yes", probabilities }) as const),
                usage: { inputTokens: 12, outputTokens: 6 },
                id: "batch-response"
              }
            })
        })
      )
    )
    expect(Result.getOrThrow(response.outcomes.functions).probabilities).toEqual(probabilities)
    expect(Result.getOrThrow(response.outcomes.exports).probabilities).toEqual(probabilities)
    expect(response.usage.inputTokens).toBe(12)
    expect(response.id).toBe("batch-response")
    expect(calls).toBe(1)
  })
)

it.effect("retains valid subjects alongside missing, refused, and invalid sibling answers", () =>
  Effect.gen(function* () {
    const input = Input.cases.After.make({
      change: { after: { path: WorkspacePath.make("file.ts"), text: "" } },
      segment: Segment.cases.After.make({ range: { start: 0, end: 0 } })
    })
    const response = yield* TraitSubject.match(
      { valid: subject, missing: subject, refused: subject, invalid: subject, noDistribution: subject },
      input
    ).pipe(
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: () =>
            Effect.succeed({
              answers: {
                valid: { _tag: "Classify", label: "yes", probabilities },
                refused: { _tag: "Refusal" },
                invalid: { _tag: "Classify", label: "yes", probabilities: { yes: 2, no: 0, uncertain: 0 } },
                noDistribution: { _tag: "Classify", label: "yes" }
              },
              usage: { inputTokens: undefined, outputTokens: undefined }
            })
        })
      )
    )
    expect(Result.getOrThrow(response.outcomes.valid).probabilities).toEqual(probabilities)
    expect(
      Record.map(response.outcomes, (outcome) => (Result.isFailure(outcome) ? outcome.failure.reason : "Answered"))
    ).toEqual({
      valid: "Answered",
      missing: "Missing",
      refused: "Refused",
      invalid: "Invalid",
      noDistribution: "NoDistribution"
    })
  })
)

it.effect("skips empty batches, supports a single subject, and preserves request-level failures", () =>
  Effect.gen(function* () {
    const input = Input.cases.After.make({
      change: { after: { path: WorkspacePath.make("file.ts"), text: "" } },
      segment: Segment.cases.After.make({ range: { start: 0, end: 0 } })
    })
    let calls = 0
    const model = yield* DecisionModel.make({
      decide: () =>
        Effect.sync(() => {
          calls++
          return {
            answers: { subject: { _tag: "Classify", label: "yes", probabilities } },
            usage: { inputTokens: undefined, outputTokens: undefined }
          }
        })
    })
    const empty = yield* TraitSubject.match({}, input).pipe(Effect.provideService(DecisionModel.DecisionModel, model))
    expect(empty.outcomes).toEqual({})
    expect(empty.usage.inputTokens).toBe(0)
    expect(calls).toBe(0)
    const single = yield* TraitSubject.match({ subject }, input).pipe(
      Effect.provideService(DecisionModel.DecisionModel, model)
    )
    expect(Result.getOrThrow(single.outcomes.subject).probabilities).toEqual(probabilities)
    expect(calls).toBe(1)
    const failure = AiError.make({
      module: "test",
      method: "decide",
      reason: AiError.InvalidUserInputError.make({ description: "Request rejected." })
    })
    const actual = yield* TraitSubject.match({ subject }, input).pipe(
      Effect.provideServiceEffect(DecisionModel.DecisionModel, DecisionModel.make({ decide: () => failure })),
      Effect.flip
    )
    expect(actual).toBe(failure)
  })
)
