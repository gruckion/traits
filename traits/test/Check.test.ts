import { expect, it } from "@effect/vitest"
import { Array, Cause, Deferred, Effect, Exit, Fiber, Layer, Order, pipe, Record, Schema as S } from "effect"
import { AiError, DecisionModel } from "effect/ai"
import { Digest } from "effect/crypto"

import { check } from "../Check/Check.ts"
import * as Enrichment from "../Enrichment/Enrichment.ts"
import { EnrichmentRegistry } from "../Enrichment/EnrichmentRegistry.ts"
import PackageJson from "../package.json" with { type: "json" }
import * as Report from "../Report/Report.ts"
import { SegmenterRegistry } from "../Segmenter/SegmenterRegistry.ts"
import { Trait } from "../Trait.ts"
import { TraitAssertion } from "../TraitAssertion.ts"
import { TraitName } from "../TraitName.ts"
import { TraitPurpose } from "../TraitPurpose.ts"
import { TraitSubject } from "../TraitSubject.ts"
import { type Change, Segment, TextDigest, WorkspacePath } from "../util/util.ts"

const trait = (name: string, options: Partial<Omit<Trait, "name" | "purpose">> = {}) =>
  Trait.make({
    name: TraitName.make(name),
    purpose: TraitPurpose.make("Protect correctness."),
    ...options
  })
const allInputsOf = (trait: Report.TraitReport) =>
  Array.flatMap(trait.changes, (change) => (Report.ChangeReport.guards.Evaluated(change) ? change.inputs : []))
/** Inputs that passed the subject gate, so their enrichments ran or were recorded. */
const inputsOf = (trait: Report.TraitReport) =>
  Array.flatMap(allInputsOf(trait), (input) => (Report.InputReport.guards.Unmatched(input) ? [] : [input]))
const assertion = TraitAssertion.make("The target is correct.")
const module = WorkspacePath.make("test/segmenter.mjs")
const context = WorkspacePath.make("test/context.mjs")
const response: DecisionModel.ProviderResponse = {
  answers: {
    assertion: { _tag: "Classify", label: "fail", probabilities: { pass: 0.1, fail: 0.8, na: 0.05, uncertain: 0.05 } }
  },
  usage: { inputTokens: undefined, outputTokens: undefined }
}
const hostFrom = (loaders: {
  readonly Segmenter: SegmenterRegistry["Service"]
  readonly Enrichment: EnrichmentRegistry["Service"]
}) =>
  Layer.mergeAll(
    Layer.succeed(SegmenterRegistry, loaders.Segmenter),
    Layer.succeed(EnrichmentRegistry, loaders.Enrichment),
    Digest.layerWebCrypto
  )
const unusedLoaders = {
  Segmenter: () => Effect.die("Unexpected segmenter lookup"),
  Enrichment: () => Effect.die("Unexpected enrichment lookup")
}
const unused = hostFrom(unusedLoaders)
const model = Layer.effect(DecisionModel.DecisionModel, DecisionModel.make({ decide: () => Effect.succeed(response) }))

it.effect("uses whole files without segmentation and keeps execution success separate from assessment acceptance", () =>
  Effect.gen(function* () {
    let assessments = 0
    const report = yield* check({
      traits: [{ trait: trait("asserted", { assertion }) }, { trait: trait("guidance") }],
      changes: [
        {
          change: {
            before: { path: WorkspacePath.make("old.ts"), text: "old" },
            after: { path: WorkspacePath.make("new.ts"), text: "😀new" }
          }
        },
        { change: { before: { path: WorkspacePath.make("removed.ts"), text: "old" } } },
        { change: { after: { path: WorkspacePath.make("empty.ts"), text: "" } } }
      ]
    }).pipe(
      Effect.provide(unused),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (options) =>
            Effect.sync(() => {
              assessments++
              // Whole-file targets are sent once, without a duplicate source or unmapped earlier text.
              expect(options.state).toHaveProperty("target")
              expect(options.state).not.toHaveProperty("source")
              expect(options.state).not.toHaveProperty("history")
              return response
            })
        })
      )
    )
    expect(assessments).toBe(3)
    expect(Array.map(inputsOf(report.traits[0]!), (input) => input.segment)).toEqual([
      Segment.cases.After.make({ range: { start: 0, end: 5 } }),
      Segment.cases.Before.make({ range: { start: 0, end: 3 } }),
      Segment.cases.After.make({ range: { start: 0, end: 0 } })
    ])
    expect(
      Array.every(report.traits, (entry) => Array.every(inputsOf(entry), Report.InputReport.guards.Completed))
    ).toBe(true)
    expect(inputsOf(report.traits[1]!)[0]).not.toHaveProperty("assessment")
    const empty = Report.SourceIdentity.make({
      path: WorkspacePath.make("empty.ts"),
      digest: TextDigest.TextDigest.make("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    })
    const old = yield* TextDigest.make("old")
    const updated = yield* TextDigest.make("😀new")
    expect(report.changes).toEqual([
      {
        before: { path: "old.ts", digest: old },
        after: { path: "new.ts", digest: updated }
      },
      { before: { path: "removed.ts", digest: old } },
      { after: empty }
    ])
    expect(Array.map(inputsOf(report.traits[0]!), (input) => input.digest)).toEqual([
      report.changes[0]!.after!.digest,
      old,
      empty.digest
    ])
    expect(report.version).toBe(1)
    expect(report.run).toEqual({
      evaluator: { name: PackageJson.name, version: PackageJson.version },
      models: [],
      usage: {}
    })
    expect(Report.verdicts(report, { fail: 0.5, pass: 0.8 }).verdict).toBe("Fail")
    expect(Report.verdicts(report, { fail: 1, pass: 0 }).verdict).toBe("Pass")
    yield* pipe(report, S.decodeEffect(Report.Report))
  }).pipe(Effect.provide(Digest.layerWebCrypto))
)

it.effect("shares segmentation across traits and validates the entire result before creating inputs", () =>
  Effect.gen(function* () {
    let setups = 0
    let executions = 0
    const registry = hostFrom({
      ...unusedLoaders,
      Segmenter: () =>
        Effect.sync(() => {
          setups++
          return (change: Change) =>
            Effect.sync(() => {
              executions++
              return [
                Segment.cases.After.make({ range: { start: 0, end: 1 } }),
                Segment.cases.After.make({ range: { start: 1, end: change.after!.path === "invalid.ts" ? 100 : 2 } })
              ]
            })
        })
    })
    const report = yield* check({
      traits: [{ trait: trait("one", { segment: module }) }, { trait: trait("two", { segment: module }) }],
      changes: [
        { change: { after: { path: WorkspacePath.make("invalid.ts"), text: "ab" } } },
        { change: { after: { path: WorkspacePath.make("valid.ts"), text: "ab" } } }
      ]
    }).pipe(Effect.provide(Layer.merge(registry, model)))
    expect(setups).toBe(1)
    expect(executions).toBe(2)
    expect(
      Array.map(report.traits, (entry) =>
        Array.map(entry.changes, (change) =>
          Report.ChangeReport.guards.Evaluated(change) ? change.inputs.length : change._tag
        )
      )
    ).toEqual([
      ["NotSegmented", 2],
      ["NotSegmented", 2]
    ])
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]!.origin).toEqual(
      Report.DiagnosticOrigin.cases.SegmenterExecution.make({ module, change: 0 })
    )
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("retains empty segment selections and reports setup failures once without replacement inputs", () =>
  Effect.gen(function* () {
    const failedModule = WorkspacePath.make("test/failed-segmenter.mjs")
    const registry = hostFrom({
      ...unusedLoaders,
      Segmenter: (reference) =>
        reference === failedModule
          ? Effect.die({ secret: "do-not-report-this" })
          : Effect.succeed(() => Effect.succeed([]))
    })
    const report = yield* check({
      traits: [
        { trait: trait("empty", { segment: module }) },
        { trait: trait("failed-one", { segment: failedModule }) },
        { trait: trait("failed-two", { segment: failedModule }) }
      ],
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "source" } } }]
    }).pipe(Effect.provide(Layer.merge(registry, model)))
    expect(Array.map(report.traits, (entry) => entry.changes)).toEqual([
      [Report.ChangeReport.cases.Evaluated.make({ inputs: [] })],
      [Report.ChangeReport.cases.NotSegmented.make({})],
      [Report.ChangeReport.cases.NotSegmented.make({})]
    ])
    expect(report.diagnostics).toHaveLength(1)
    expect(JSON.stringify(report)).not.toContain("do-not-report-this")
    expect(Report.verdicts(report, { fail: 1, pass: 0 })).toEqual({
      verdict: "Incomplete",
      traits: [
        { verdict: "Pass", changes: [{ verdict: "Pass", inputs: [] }] },
        { verdict: "Incomplete", changes: [{ verdict: "Incomplete", inputs: [] }] },
        { verdict: "Incomplete", changes: [{ verdict: "Incomplete", inputs: [] }] }
      ]
    })
  })
)

it.effect("reports failed enrichment setup once and omits it from every trait's executable work", () =>
  Effect.gen(function* () {
    let lookups = 0
    const registry = hostFrom({
      ...unusedLoaders,
      Enrichment: () => {
        lookups++
        return Enrichment.EnrichmentSetupError.make({ instruction: "Restore the enrichment dependency." })
      }
    })
    const report = yield* check({
      traits: [
        { trait: trait("one", { enrichments: [context] }) },
        { trait: trait("two", { enrichments: [context] }) }
      ],
      changes: [
        { change: { after: { path: WorkspacePath.make("one.ts"), text: "one" } } },
        { change: { after: { path: WorkspacePath.make("two.ts"), text: "two" } } }
      ]
    }).pipe(Effect.provide(Layer.merge(registry, model)))
    expect(lookups).toBe(1)
    expect(report.diagnostics).toHaveLength(1)
    for (const trait of report.traits) {
      const setupFailed = [Report.EnrichmentOutcome.cases.SetupFailed.make({ module: context })]
      expect(Array.map(inputsOf(trait), (input) => [input._tag, input.enrichments])).toEqual([
        ["Completed", setupFailed],
        ["Completed", setupFailed]
      ])
    }
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("allows enrichment-only recovery to proceed, but blocks Input-scoped assessment", () =>
  Effect.gen(function* () {
    for (const reason of [
      Enrichment.EnrichmentErrorReason.cases.Enrichment.make({}),
      Enrichment.EnrichmentErrorReason.cases.Input.make({})
    ]) {
      const registry = hostFrom({
        ...unusedLoaders,
        Enrichment: () =>
          Effect.succeed(
            Enrichment.EnrichmentError.make({ reason, instruction: "Restore the missing context and rerun." })
          )
      })
      const report = yield* check({
        traits: [{ trait: trait("example", { assertion, enrichments: [context] }) }],
        changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "source" } } }]
      }).pipe(Effect.provide(Layer.merge(registry, model)))
      expect(report.diagnostics).toEqual([])
      const input = inputsOf(report.traits[0]!)[0]!
      const inputScoped = Enrichment.EnrichmentErrorReason.guards.Input(reason)
      expect(input._tag).toBe(inputScoped ? "Failed" : "Completed")
      expect(Report.InputReport.guards.Completed(input) && input.assessment !== undefined).toBe(!inputScoped)
      expect(input.enrichments).toEqual([
        Report.EnrichmentOutcome.cases.Failed.make({
          module: context,
          explanation: Report.Explanation.cases.Instruction.make({
            instruction: "Restore the missing context and rerun."
          })
        })
      ])
      yield* pipe(report, S.decodeEffect(Report.Report))
    }
  })
)

it.effect("retains empty enrichment context and reports failed enrichment without exposing source", () =>
  Effect.gen(function* () {
    const empty = WorkspacePath.make("test/empty-context.mjs")
    const registry = hostFrom({
      ...unusedLoaders,
      Enrichment: (module) =>
        Effect.succeed(
          module === empty
            ? Effect.succeed("")
            : Enrichment.EnrichmentError.make({
                reason: Enrichment.EnrichmentErrorReason.cases.Enrichment.make({}),
                instruction: "Restore the missing context."
              })
        )
    })
    const report = yield* check({
      traits: [{ trait: trait("example", { enrichments: [empty, context] }) }],
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "private-source" } } }]
    }).pipe(Effect.provide(Layer.merge(registry, model)))
    expect(inputsOf(report.traits[0]!)[0]!.enrichments).toEqual([
      Report.EnrichmentOutcome.cases.Succeeded.make({ module: empty, text: "" }),
      Report.EnrichmentOutcome.cases.Failed.make({
        module: context,
        explanation: Report.Explanation.cases.Instruction.make({ instruction: "Restore the missing context." })
      })
    ])
    expect(report.diagnostics).toEqual([])
    expect(JSON.stringify(report)).not.toContain("private-source")
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("Trait recovery cancels sibling input work without cancelling unrelated traits", () =>
  Effect.gen(function* () {
    const assessingSibling = yield* Deferred.make<void>()
    const registry = hostFrom({
      ...unusedLoaders,
      Segmenter: () =>
        Effect.succeed(() =>
          Effect.succeed([
            Segment.cases.After.make({ range: { start: 0, end: 1 } }),
            Segment.cases.After.make({ range: { start: 1, end: 2 } })
          ])
        ),
      Enrichment: () =>
        Effect.succeed(
          Effect.gen(function* () {
            const current = yield* Enrichment.EnrichmentContext
            if (current.input.segment.range.start === 0) {
              yield* Deferred.await(assessingSibling)
              return yield* Enrichment.EnrichmentError.make({
                reason: Enrichment.EnrichmentErrorReason.cases.Trait.make({}),
                instruction: "Restore the trait prerequisite and rerun."
              })
            }
            return "context"
          })
        )
    })
    const report = yield* check({
      traits: [
        { trait: trait("recovering", { assertion, segment: module, enrichments: [context] }) },
        { trait: trait("unaffected") }
      ],
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "ab" } } }]
    }).pipe(
      Effect.provide(registry),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: () => Deferred.succeed(assessingSibling, undefined).pipe(Effect.andThen(Effect.never))
        })
      )
    )
    expect(Array.map(inputsOf(report.traits[0]!), (input) => input._tag)).toEqual(["Failed", "Cancelled"])
    expect(inputsOf(report.traits[1]!)[0]!._tag).toBe("Completed")
    expect(report.diagnostics).toEqual([])
    expect(Array.map(Report.problems(report), (problem) => problem._tag)).toEqual(["Enrichment"])
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("explains assessment failures by reason without leaking provider text, defects, or source", () =>
  Effect.gen(function* () {
    const providerError = (reason: AiError.AiErrorReason) =>
      Effect.fail(AiError.make({ module: "Test", method: "decide", reason }))
    const cases = [
      [() => Effect.die({ secret: "private-error" }), "Assertion assessment failed or returned invalid probabilities."],
      [
        () => Effect.succeed({ answers: {}, usage: { inputTokens: undefined, outputTokens: undefined } }),
        /^Assertion assessment failed: unanswered \(\w+\)\.$/u
      ],
      [
        () => providerError(AiError.InvalidRequestError.make({ description: "rejected private-error secret-source" })),
        "Assertion assessment failed: InvalidRequestError."
      ],
      [
        () => providerError(AiError.AuthenticationError.make({ kind: "InvalidKey", description: "private-error" })),
        "Assertion assessment failed: AuthenticationError (InvalidKey)."
      ]
    ] as const
    for (const [decide, expected] of cases) {
      const report = yield* check({
        traits: [{ trait: trait("example", { assertion }) }],
        changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "secret-source" } } }]
      }).pipe(
        Effect.provide(unused),
        Effect.provideServiceEffect(DecisionModel.DecisionModel, DecisionModel.make({ decide }))
      )
      const input = inputsOf(report.traits[0]!)[0]!
      expect(input._tag).toBe("Failed")
      const explanation = Report.InputReport.guards.Failed(input) ? input.explanation : undefined
      expect(explanation?._tag).toBe("Error")
      if (explanation !== undefined && Report.Explanation.guards.Error(explanation)) {
        expect(explanation.error).toMatch(expected)
      }
      expect(report.diagnostics).toEqual([])
      expect(Report.problems(report)).toEqual([
        Report.Problem.cases.Assessment.make({ trait: 0, change: 0, input: 0, explanation: explanation! })
      ])
      expect(JSON.stringify(report)).not.toContain("private-error")
      expect(JSON.stringify(report)).not.toContain("secret-source")
      yield* pipe(report, S.decodeEffect(Report.Report))
    }
  })
)

it.effect("uses normal fiber interruption and waits for execution cleanup", () =>
  Effect.gen(function* () {
    const waiting = yield* Deferred.make<void>()
    const firstAssessed = yield* Deferred.make<void>()
    let cleaned = false
    const running = yield* check({
      traits: [{ trait: trait("example", { assertion }) }],
      changes: [
        { change: { after: { path: WorkspacePath.make("one.ts"), text: "one" } } },
        { change: { after: { path: WorkspacePath.make("two.ts"), text: "two" } } }
      ]
    }).pipe(
      Effect.provide(unused),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (options) =>
            Effect.gen(function* () {
              if (S.is(S.Struct({ target: S.Literal("one") }))(options.state)) {
                yield* Deferred.succeed(firstAssessed, undefined)
                return response
              }
              yield* Deferred.await(firstAssessed)
              yield* Effect.yieldNow
              return yield* Deferred.succeed(waiting, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.ensuring(
                  Effect.sync(() => {
                    cleaned = true
                  })
                )
              )
            })
        })
      ),
      Effect.forkChild
    )
    yield* Deferred.await(waiting)
    yield* Fiber.interrupt(running)
    const exit = yield* Fiber.await(running)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    }
    expect(cleaned).toBe(true)
  })
)

it.effect("rejects ambiguous requests before any extension or model work", () =>
  Effect.gen(function* () {
    const source = { after: { path: WorkspacePath.make("file.ts"), text: "source" } }
    for (const request of [
      { traits: [{ trait: trait("same") }, { trait: trait("same") }], changes: [{ change: source }] },
      { traits: [{ trait: trait("one") }], changes: [{ change: source }, { change: source }] },
      {
        traits: [{ trait: trait("one") }],
        changes: [{ change: source, ignores: Record.singleton(TraitName.make("missing"), "x") }]
      }
    ]) {
      const error = yield* check(request).pipe(
        Effect.provide(unused),
        Effect.provideServiceEffect(
          DecisionModel.DecisionModel,
          DecisionModel.make({ decide: () => Effect.die("Unexpected assessment") })
        ),
        Effect.flip
      )
      expect(S.isSchemaError(error)).toBe(true)
    }
  })
)

it.effect("records ignored changes and skips segmentation needed only by ignoring traits", () =>
  Effect.gen(function* () {
    const segmented: Array<string> = []
    const registry = hostFrom({
      ...unusedLoaders,
      Segmenter: () =>
        Effect.succeed((change: Change) =>
          Effect.sync(() => {
            segmented.push(change.after!.path)
            return [Segment.cases.After.make({ range: { start: 0, end: 1 } })]
          })
        )
    })
    const report = yield* check({
      traits: [{ trait: trait("segmented", { assertion, segment: module }) }, { trait: trait("whole", { assertion }) }],
      changes: [
        { change: { after: { path: WorkspacePath.make("source.ts"), text: "source" } } },
        {
          change: { after: { path: WorkspacePath.make("generated.ts"), text: "generated" } },
          ignores: Record.singleton(TraitName.make("segmented"), "Generated code.")
        }
      ]
    }).pipe(Effect.provide(Layer.merge(registry, model)))
    expect(segmented).toEqual(["source.ts"])
    expect(report.diagnostics).toEqual([])
    expect(Array.map(report.traits[0]!.changes, (change) => change._tag)).toEqual(["Evaluated", "Ignored"])
    expect(report.traits[0]!.changes[1]).toEqual(Report.ChangeReport.cases.Ignored.make({ reason: "Generated code." }))
    expect(Array.map(report.traits[1]!.changes, (change) => change._tag)).toEqual(["Evaluated", "Evaluated"])
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("records sorted model identities and token totals only when every response reports them", () =>
  Effect.gen(function* () {
    const responses: ReadonlyArray<DecisionModel.ProviderResponse> = [
      { ...response, modelId: "model-b", usage: { inputTokens: 10, outputTokens: 2 } },
      { ...response, modelId: "model-a", usage: { inputTokens: 5, outputTokens: undefined } },
      { ...response, modelId: "model-b", usage: { inputTokens: 1, outputTokens: 1 } }
    ]
    let index = 0
    const report = yield* check({
      traits: [{ trait: trait("example", { assertion }) }],
      changes: [
        { change: { after: { path: WorkspacePath.make("one.ts"), text: "one" } } },
        { change: { after: { path: WorkspacePath.make("two.ts"), text: "two" } } },
        { change: { after: { path: WorkspacePath.make("three.ts"), text: "three" } } }
      ]
    }).pipe(
      Effect.provide(unused),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({ decide: () => Effect.sync(() => responses[index++]!) })
      )
    )
    expect(report.run.models).toEqual(["model-a", "model-b"])
    expect(report.run.usage).toEqual({ inputTokens: 16 })
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("records enrichments cancelled by another enrichment's Input recovery", () =>
  Effect.gen(function* () {
    const slow = WorkspacePath.make("test/slow-context.mjs")
    const registry = hostFrom({
      ...unusedLoaders,
      Enrichment: (module) =>
        Effect.succeed(
          module === slow
            ? Effect.never
            : Enrichment.EnrichmentError.make({
                reason: Enrichment.EnrichmentErrorReason.cases.Input.make({}),
                instruction: "Restore the missing context and rerun."
              })
        )
    })
    const report = yield* check({
      traits: [{ trait: trait("example", { assertion, enrichments: [context, slow] }) }],
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "source" } } }]
    }).pipe(Effect.provide(Layer.merge(registry, model)))
    const input = inputsOf(report.traits[0]!)[0]!
    expect(input._tag).toBe("Failed")
    expect(input.enrichments).toEqual([
      Report.EnrichmentOutcome.cases.Failed.make({
        module: context,
        explanation: Report.Explanation.cases.Instruction.make({
          instruction: "Restore the missing context and rerun."
        })
      }),
      Report.EnrichmentOutcome.cases.Cancelled.make({ module: slow })
    ])
    expect(report.diagnostics).toEqual([])
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

it.effect("reports host-supplied trait origins", () =>
  Effect.gen(function* () {
    const origin = Report.TraitOrigin.make({ path: WorkspacePath.make(".agents/traits/with-origin.md") })
    const report = yield* check({
      traits: [{ trait: trait("with-origin"), origin }, { trait: trait("without-origin") }],
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "source" } } }]
    }).pipe(Effect.provide(Layer.merge(unused, model)))
    expect(report.traits[0]!.origin).toEqual(origin)
    expect(report.traits[1]!).not.toHaveProperty("origin")
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)

const subject = TraitSubject.make("An exported constant.")
/** Answers subject decisions by target text, so "skip" is ruled out and "maybe" is uncertain, and assertions with the shared response. */
const gatedModel = () => {
  const calls = { subject: 0, assertion: 0 }
  return {
    calls: () => ({ ...calls }),
    model: DecisionModel.make({
      decide: (options) =>
        Effect.sync((): DecisionModel.ProviderResponse => {
          if ("assertion" in options.decisions) {
            calls.assertion++
            return response
          }
          calls.subject++
          const target = (options.state as { readonly target: string }).target
          const label = target === "skip" ? "no" : target === "maybe" ? "uncertain" : "yes"
          const answer = {
            _tag: "Classify",
            label,
            probabilities: {
              yes: label === "yes" ? 0.9 : 0.05,
              no: label === "no" ? 0.9 : 0.05,
              uncertain: label === "uncertain" ? 0.9 : 0.05
            }
          } as const
          // Subject decisions for one input arrive batched, one keyed question per trait.
          return {
            answers: Record.map(options.decisions, () => answer),
            usage: { inputTokens: 1, outputTokens: 1 }
          }
        })
    })
  }
}

it.effect(
  "gates enrichments and the assertion on the subject decision, proceeding unless it rules the target out",
  () =>
    Effect.gen(function* () {
      const gated = gatedModel()
      let enrichments = 0
      const registry = hostFrom({
        ...unusedLoaders,
        Enrichment: () => Effect.succeed(Effect.sync(() => (enrichments++, "context")))
      })
      const report = yield* check({
        traits: [
          { trait: trait("asserted", { subject, assertion, enrichments: [context] }) },
          { trait: trait("guidance", { subject }) },
          { trait: trait("ungated", { assertion }) }
        ],
        changes: Array.map(["match", "skip", "maybe"], (text) => ({
          change: { after: { path: WorkspacePath.make(`${text}.ts`), text } }
        }))
      }).pipe(Effect.provide(registry), Effect.provideServiceEffect(DecisionModel.DecisionModel, gated.model))
      // Both gated traits' subjects share one request per file.
      expect(gated.calls()).toEqual({ subject: 3, assertion: 2 + 3 })
      expect(enrichments).toBe(2)
      const [asserted, guidance, ungated] = report.traits
      expect(Array.map(allInputsOf(asserted!), (input) => input._tag)).toEqual(["Completed", "Unmatched", "Completed"])
      const skipDigest = yield* TextDigest.make("skip")
      expect(allInputsOf(asserted!)[1]).toEqual(
        Report.InputReport.cases.Unmatched.make({
          segment: Segment.cases.After.make({ range: { start: 0, end: 4 } }),
          digest: skipDigest,
          subject: { yes: 0.05, no: 0.9, uncertain: 0.05 }
        })
      )
      expect(Array.map(inputsOf(asserted!), (input) => [input.subject, input.enrichments.length])).toEqual([
        [{ yes: 0.9, no: 0.05, uncertain: 0.05 }, 1],
        [{ yes: 0.05, no: 0.05, uncertain: 0.9 }, 1]
      ])
      expect(inputsOf(asserted!)[0]).toHaveProperty("assessment")
      expect(Array.map(allInputsOf(guidance!), (input) => input._tag)).toEqual(["Completed", "Unmatched", "Completed"])
      expect(inputsOf(guidance!)[0]).not.toHaveProperty("assessment")
      expect(Array.every(allInputsOf(ungated!), (input) => !("subject" in input))).toBe(true)
      expect(report.run.usage).toEqual({})
      const verdicts = Report.verdicts(report, Report.DecisionPolicy.make({ fail: 0.5, pass: 0.5 }))
      expect(Array.map(verdicts.traits, (trait) => Array.flatMap(trait.changes, (change) => change.inputs))).toEqual([
        ["Fail", "Pass", "Fail"],
        ["Pass", "Pass", "Pass"],
        ["Fail", "Fail", "Fail"]
      ])
      yield* pipe(report, S.decodeEffect(Report.Report))
    }).pipe(Effect.provide(Digest.layerWebCrypto))
)

it.effect("fails inputs whose subject decision fails, without running enrichments or the assertion", () =>
  Effect.gen(function* () {
    let assertions = 0
    const registry = hostFrom({
      ...unusedLoaders,
      Enrichment: () => Effect.succeed(Effect.die("Unexpected enrichment"))
    })
    const report = yield* check({
      traits: [{ trait: trait("asserted", { subject, assertion, enrichments: [context] }) }],
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "private-source" } } }]
    }).pipe(
      Effect.provide(registry),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (options) =>
            !("assertion" in options.decisions)
              ? Effect.die("provider exploded")
              : Effect.sync(() => (assertions++, response))
        })
      )
    )
    expect(assertions).toBe(0)
    const digest = yield* TextDigest.make("private-source")
    expect(allInputsOf(report.traits[0]!)).toEqual([
      Report.InputReport.cases.Failed.make({
        segment: Segment.cases.After.make({ range: { start: 0, end: 14 } }),
        digest,
        enrichments: [Report.EnrichmentOutcome.cases.Cancelled.make({ module: context })],
        explanation: Report.Explanation.cases.Error.make({
          error: "Subject decision failed or returned invalid probabilities."
        })
      })
    ])
    expect(Report.verdicts(report, Report.DecisionPolicy.make({ fail: 0.5, pass: 0.5 })).verdict).toBe("Incomplete")
    yield* pipe(report, S.decodeEffect(Report.Report))
  }).pipe(Effect.provide(Digest.layerWebCrypto))
)

it.effect("batches subject decisions per input, splits large batches, and counts shared usage once", () =>
  Effect.gen(function* () {
    const questions: Array<number> = []
    const report = yield* check({
      traits: Array.map(Array.range(1, 40), (index) => ({
        trait: trait(`subject-${index}`, { subject: TraitSubject.make(`Subject ${index}.`) })
      })),
      changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "export const a = 1" } } }]
    }).pipe(
      Effect.provide(unused),
      Effect.provideServiceEffect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (options) =>
            Effect.sync(() => {
              questions.push(Record.size(options.decisions))
              return {
                answers: Record.map(options.decisions, () => ({
                  _tag: "Classify",
                  label: "no",
                  probabilities: { yes: 0.05, no: 0.9, uncertain: 0.05 }
                })),
                usage: { inputTokens: 10, outputTokens: 2 },
                modelId: "batched"
              }
            })
        })
      )
    )
    expect(Array.sort(questions, Order.Number)).toEqual([8, 32])
    expect(report.run.usage).toEqual({ inputTokens: 20, outputTokens: 4 })
    expect(report.run.models).toEqual(["batched"])
    expect(
      Array.every(report.traits, (entry) => Array.every(allInputsOf(entry), Report.InputReport.guards.Unmatched))
    ).toBe(true)
    yield* pipe(report, S.decodeEffect(Report.Report))
  })
)
