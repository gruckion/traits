import { expect, it } from "@effect/vitest"
import { Effect, pipe, Schema as S, String } from "effect"

import * as Report from "../Report/Report.ts"
import { Segment, WorkspacePath } from "../util/util.ts"

const digest = `sha256:${pipe("0", String.repeat(64))}`
const trait = { name: "example", purpose: "Protect correctness.", assertion: "The code is correct." }
const guidance = { name: trait.name, purpose: trait.purpose }
const run = { evaluator: { name: "traits", version: "0.0.0" }, models: [], usage: {} }
const assessment = { pass: 0.9, fail: 0.05, na: 0.03, uncertain: 0.02 }
const fields = { segment: Segment.cases.After.make({ range: { start: 0, end: 1 } }), digest, enrichments: [] }
const completed = { _tag: "Completed", ...fields, assessment }
const evaluated = (...inputs: ReadonlyArray<unknown>) => ({ _tag: "Evaluated", inputs })
const reportWith = (
  change: unknown = evaluated(completed),
  selectedTrait: unknown = trait,
  diagnostics: ReadonlyArray<unknown> = []
) => ({
  version: 1,
  run,
  changes: [{ after: { path: "file.ts", digest } }],
  diagnostics,
  traits: [{ trait: selectedTrait, changes: [change] }]
})
const decode = S.decodeUnknownEffect(Report.Report)
const policy = { fail: 0.5, pass: 0.8 }
const lenient = { fail: 1, pass: 0 }
const module = WorkspacePath.make("test/context.mjs")
const failedEnrichment = {
  _tag: "Failed",
  module,
  explanation: { _tag: "Error", error: "Enrichment failed." }
}

it.effect("separates completed execution from policy-dependent verdicts", () =>
  Effect.gen(function* () {
    const report = yield* decode(reportWith())
    expect(Report.verdicts(report, policy)).toEqual({
      verdict: "Pass",
      traits: [{ verdict: "Pass", changes: [{ verdict: "Pass", inputs: ["Pass"] }] }]
    })
    expect(pipe(report, Report.verdicts({ fail: 0.5, pass: 0.99 })).verdict).toBe("Inconclusive")
    expect(Report.verdicts(report, { fail: 0.05, pass: 0.8 }).verdict).toBe("Fail")
  })
)

it.effect("accepts not-applicable assessments only when the policy says so", () =>
  Effect.gen(function* () {
    const assessed = (assessment: Report.Assessment) => decode(reportWith(evaluated({ ...completed, assessment })))
    const na = yield* assessed({ pass: 0.01, fail: 0.01, na: 0.97, uncertain: 0.01 })
    expect(Report.verdicts(na, policy).verdict).toBe("Inconclusive")
    expect(Report.verdicts(na, { ...policy, na: 0.9 }).verdict).toBe("Pass")
    const failing = yield* assessed({ pass: 0.01, fail: 0.6, na: 0.95, uncertain: 0.01 })
    expect(Report.verdicts(failing, { ...policy, na: 0.9 }).verdict).toBe("Fail")
    expect(S.is(Report.DecisionPolicy)({ fail: 1.5, pass: 0.8 })).toBe(false)
  })
)

it.effect("combines verdicts by precedence Fail, Incomplete, Inconclusive, then Pass", () =>
  Effect.gen(function* () {
    const traitWith = (name: string, input: unknown) => ({ trait: { ...trait, name }, changes: [evaluated(input)] })
    const failing = traitWith("failing", {
      ...completed,
      assessment: { pass: 0.05, fail: 0.9, na: 0.03, uncertain: 0.02 }
    })
    const inconclusive = traitWith("inconclusive", {
      ...completed,
      assessment: { pass: 0.5, fail: 0.3, na: 0.1, uncertain: 0.1 }
    })
    const incomplete = traitWith("incomplete", { _tag: "Cancelled", ...fields })
    const passing = traitWith("passing", completed)
    const combined = (traits: ReadonlyArray<unknown>) =>
      decode({ ...reportWith(), traits }).pipe(Effect.map((report) => Report.verdicts(report, policy).verdict))
    const combinations = yield* Effect.all(
      [
        combined([]),
        combined([failing, incomplete]),
        combined([inconclusive, incomplete]),
        combined([passing, inconclusive])
      ],
      { concurrency: "unbounded" }
    )
    expect(combinations).toEqual(["Pass", "Fail", "Incomplete", "Inconclusive"])
  })
)

it.effect("ties assessments and failure explanations to execution state and the trait's assertion", () =>
  Effect.gen(function* () {
    const { assessment: _assessment, ...withoutAssessment } = completed
    expect(S.is(Report.Report)(reportWith(evaluated(withoutAssessment)))).toBe(false)
    expect(S.is(Report.Report)(reportWith(evaluated(completed), guidance))).toBe(false)
    expect(S.is(Report.Report)(reportWith(evaluated({ _tag: "Failed", ...fields, assessment })))).toBe(false)
    const guidanceOnly = yield* decode(reportWith(evaluated(withoutAssessment), guidance))
    expect(Report.verdicts(guidanceOnly, { fail: 0, pass: 1 }).verdict).toBe("Pass")
    const explanation = { _tag: "Error", error: "Assessment request failed." }
    const assessmentFailed = { _tag: "Failed", ...fields, explanation }
    const failed = yield* decode(reportWith(evaluated(assessmentFailed)))
    expect(Report.verdicts(failed, lenient).verdict).toBe("Incomplete")
    expect(S.is(Report.Report)(reportWith(evaluated(assessmentFailed), guidance))).toBe(false)
    expect(S.is(Report.Report)(reportWith(evaluated({ _tag: "Failed", ...fields })))).toBe(false)
    const cancelled = yield* decode(reportWith(evaluated({ _tag: "Cancelled", ...fields }), guidance))
    expect(Report.verdicts(cancelled, lenient).verdict).toBe("Incomplete")
  })
)

it.effect("lets violations outrank reduced enrichment context", () =>
  Effect.gen(function* () {
    const enriched = { ...trait, enrichments: [module] }
    const reduced = { ...completed, enrichments: [failedEnrichment] }
    const passing = yield* decode(reportWith(evaluated(reduced), enriched))
    expect(Report.verdicts(passing, policy).traits[0]!.changes[0]!.inputs).toEqual(["Incomplete"])
    const failing = yield* decode(
      reportWith(evaluated({ ...reduced, assessment: { pass: 0.05, fail: 0.9, na: 0.03, uncertain: 0.02 } }), enriched)
    )
    expect(Report.verdicts(failing, policy).verdict).toBe("Fail")
    const stopped = yield* decode(
      reportWith(evaluated({ _tag: "Failed", ...fields, enrichments: [failedEnrichment] }), enriched)
    )
    expect(Report.verdicts(stopped, lenient).verdict).toBe("Incomplete")
  })
)

it("aligns enrichment outcomes with configured enrichments and setup diagnostics", () => {
  const other = WorkspacePath.make("test/other.mjs")
  const enriched = { ...trait, enrichments: [module, other] }
  const succeeded = (module: string) => ({ _tag: "Succeeded", module, text: "" })
  const withEnrichments = (enrichments: ReadonlyArray<unknown>, diagnostics: ReadonlyArray<unknown> = []) =>
    reportWith(evaluated({ ...completed, enrichments }), enriched, diagnostics)
  const setup = Report.Diagnostic.make({
    origin: Report.DiagnosticOrigin.cases.EnrichmentSetup.make({ module }),
    explanation: Report.Explanation.cases.Error.make({ error: "Enrichment initialization failed." })
  })
  expect(S.is(Report.Report)(withEnrichments([succeeded(module), succeeded(other)]))).toBe(true)
  expect(S.is(Report.Report)(withEnrichments([succeeded(module)]))).toBe(false)
  expect(S.is(Report.Report)(withEnrichments([succeeded(other), succeeded(module)]))).toBe(false)
  expect(S.is(Report.Report)(withEnrichments([{ _tag: "SetupFailed", module }, succeeded(other)], [setup]))).toBe(true)
  expect(S.is(Report.Report)(withEnrichments([{ _tag: "SetupFailed", module }, succeeded(other)]))).toBe(false)
  expect(S.is(Report.Report)(withEnrichments([succeeded(module), succeeded(other)], [setup]))).toBe(false)
  expect(S.is(Report.Report)(withEnrichments([{ _tag: "Cancelled", module }, succeeded(other)]))).toBe(true)
})

it.effect("marks changes NotSegmented exactly when a shared segmenter diagnostic explains them", () =>
  Effect.gen(function* () {
    const segmenter = WorkspacePath.make("test/segmenter.mjs")
    const segmented = { ...trait, segment: segmenter }
    const execution = Report.Diagnostic.make({
      origin: Report.DiagnosticOrigin.cases.SegmenterExecution.make({ module: segmenter, change: 0 }),
      explanation: Report.Explanation.cases.Instruction.make({ instruction: "Fix the syntax and rerun." })
    })
    const notSegmented = yield* decode(reportWith({ _tag: "NotSegmented" }, segmented, [execution]))
    expect(Report.verdicts(notSegmented, lenient)).toEqual({
      verdict: "Incomplete",
      traits: [{ verdict: "Incomplete", changes: [{ verdict: "Incomplete", inputs: [] }] }]
    })
    expect(S.is(Report.Report)(reportWith({ _tag: "NotSegmented" }, segmented))).toBe(false)
    expect(S.is(Report.Report)(reportWith({ _tag: "NotSegmented" }, trait))).toBe(false)
    expect(S.is(Report.Report)(reportWith(evaluated(completed), segmented, [execution]))).toBe(false)
    expect(S.is(Report.Report)(reportWith(evaluated(completed), trait, [execution]))).toBe(false)
    const empty = yield* decode(reportWith(evaluated(), segmented))
    expect(Report.verdicts(empty, policy).verdict).toBe("Pass")
  })
)

it.effect("records ignored changes without affecting verdicts", () =>
  Effect.gen(function* () {
    const twoChanges = {
      ...reportWith(),
      changes: [{ after: { path: "file.ts", digest } }, { after: { path: "generated.ts", digest } }]
    }
    const withChanges = (changes: ReadonlyArray<unknown>) => ({ ...twoChanges, traits: [{ trait, changes }] })
    const report = yield* decode(withChanges([evaluated(completed), { _tag: "Ignored", reason: "Generated code." }]))
    expect(Report.verdicts(report, policy)).toEqual({
      verdict: "Pass",
      traits: [{ verdict: "Pass", changes: [{ verdict: "Pass", inputs: ["Pass"] }, { inputs: [] }] }]
    })
    expect(S.is(Report.Report)(withChanges([evaluated(completed)]))).toBe(false)
    expect(S.is(Report.Report)(withChanges([evaluated(completed), { _tag: "Ignored", reason: " " }]))).toBe(false)
  })
)

it("requires portable, unambiguous identities", () => {
  const valid = reportWith()
  expect(S.is(Report.Report)(valid)).toBe(true)
  expect(S.is(Report.Report)({ ...valid, version: 2 })).toBe(false)
  expect(S.is(Report.Report)({ ...valid, traits: [...valid.traits, ...valid.traits] })).toBe(false)
  expect(S.is(Report.Report)({ ...valid, changes: [...valid.changes, { after: { path: "file.ts", digest } }] })).toBe(
    false
  )
  const copy = {
    changes: [
      { before: { path: "file.ts", digest }, after: { path: "file.ts", digest } },
      { before: { path: "file.ts", digest }, after: { path: "copy.ts", digest } }
    ],
    traits: [{ trait, changes: [evaluated(completed), evaluated(completed)] }]
  }
  expect(S.is(Report.Report)({ ...valid, ...copy })).toBe(true)
  for (const path of ["/abs/file.ts", "./file.ts", "../file.ts", "dir\\file.ts", "C:/file.ts"]) {
    expect(S.is(Report.Report)({ ...valid, changes: [{ after: { path, digest } }] })).toBe(false)
  }
  expect(S.is(Report.Report)({ ...valid, changes: [{ after: { path: "file.ts", digest: "abc" } }] })).toBe(false)
  expect(S.is(Report.Report)(reportWith(evaluated({ ...completed, digest: "sha256:ABC" })))).toBe(false)
  expect(
    S.is(Report.Report)(
      reportWith(evaluated({ ...completed, segment: Segment.cases.Before.make({ range: { start: 0, end: 1 } }) }))
    )
  ).toBe(false)
  expect(S.is(Report.Report)({ ...valid, run: { ...run, models: ["a", "a"] } })).toBe(false)
})

it("records host-supplied trait origins", () => {
  const withOrigin = (origin: unknown) => ({
    ...reportWith(),
    traits: [{ trait, origin, changes: [evaluated(completed)] }]
  })
  expect(S.is(Report.Report)(withOrigin({ path: ".agents/traits/example.md" }))).toBe(true)
  expect(S.is(Report.Report)(withOrigin({ collection: { collection: "github:example/traits" } }))).toBe(true)
  expect(S.is(Report.Report)(withOrigin({}))).toBe(false)
  expect(S.is(Report.Report)(withOrigin({ path: "/absolute/example.md" }))).toBe(false)
})

it.effect("lists shared and local problems with their locations", () =>
  Effect.gen(function* () {
    const enriched = { ...trait, enrichments: [module] }
    const setup = Report.Diagnostic.make({
      origin: Report.DiagnosticOrigin.cases.EnrichmentSetup.make({ module }),
      explanation: Report.Explanation.cases.Error.make({ error: "Enrichment initialization failed." })
    })
    const assessmentError = Report.Explanation.cases.Error.make({ error: "Assessment request failed." })
    const report = yield* decode({
      ...reportWith(),
      changes: [{ after: { path: "a.ts", digest } }, { after: { path: "b.ts", digest } }],
      traits: [
        {
          trait: enriched,
          changes: [
            evaluated({ ...completed, enrichments: [failedEnrichment] }),
            evaluated({
              _tag: "Failed",
              ...fields,
              enrichments: [{ _tag: "Succeeded", module, text: "" }],
              explanation: assessmentError
            })
          ]
        },
        { trait: { ...trait, name: "set-up", enrichments: [module] }, changes: [evaluated(), evaluated()] }
      ]
    })
    expect(S.is(Report.Report)({ ...report, diagnostics: [setup] })).toBe(false)
    expect(Report.problems(report)).toEqual([
      Report.Problem.cases.Enrichment.make({
        trait: 0,
        change: 0,
        input: 0,
        module,
        explanation: Report.Explanation.cases.Error.make({ error: "Enrichment failed." })
      }),
      Report.Problem.cases.Assessment.make({ trait: 0, change: 1, input: 0, explanation: assessmentError })
    ])
  })
)

it.effect("round-trips through JSON and exports a JSON Schema for non-TypeScript consumers", () =>
  Effect.gen(function* () {
    const report = yield* decode(reportWith())
    const encoded = yield* pipe(report, S.encodeEffect(Report.Report))
    const decoded = yield* decode(JSON.parse(JSON.stringify(encoded)))
    expect(decoded).toEqual(report)
    expect(S.toJsonSchemaDocument(Report.Report).schema).toBeDefined()
  })
)
