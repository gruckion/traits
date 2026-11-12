import { Array, Effect, pipe, Result } from "effect"

import { EnrichmentRegistry } from "../Enrichment/EnrichmentRegistry.ts"
import * as Report from "../Report/Report.ts"
import * as Segmentation from "../Segmenter/Segmentation.ts"
import { SegmenterRegistry } from "../Segmenter/SegmenterRegistry.ts"
import type { Input, WorkspacePath } from "../util/util.ts"
import type { CheckInput } from "./CheckInput.ts"

/** Completed setup and segmentation shared by all traits in one check. */
export interface Preparation {
  readonly setupDiagnostics: ReadonlyArray<Report.Diagnostic>
  /** Executions of successfully initialized enrichments, by module. */
  readonly enrichments: ReadonlyMap<WorkspacePath, Effect.Success<ReturnType<EnrichmentRegistry["Service"]>>>
  /** Per-module results in change order; undefined where every trait using the module ignores the change. */
  readonly segmentations: ReadonlyMap<
    WorkspacePath,
    ReadonlyArray<Result.Result<ReadonlyArray<Input>, Report.Diagnostic> | undefined>
  >
}

/** Simultaneous segmenter executions per module; segmenters are extension code that may spawn processes or call models, which nothing else limits. */
const segmentationConcurrency = 8

/** Collects immutable results; registry layers, not preparation, own setup caching. */
export const make = Effect.fnUntraced(function* (
  request: CheckInput
): Effect.fn.Return<Preparation, never, SegmenterRegistry | EnrichmentRegistry> {
  const segmenterRegistry = yield* SegmenterRegistry
  const enrichmentRegistry = yield* EnrichmentRegistry
  const modules = {
    segmenters: Array.dedupe(
      Array.flatMap(request.traits, (entry) => (entry.trait.segment === undefined ? [] : [entry.trait.segment]))
    ),
    enrichments: Array.dedupe(Array.flatMap(request.traits, (entry) => entry.trait.enrichments ?? []))
  }
  const setups = yield* Effect.all(
    {
      segmenterSetups: Effect.forEach(
        modules.segmenters,
        (module) => {
          const origin = Report.DiagnosticOrigin.cases.SegmenterSetup.make({ module })
          const fallback = Report.Diagnostic.make({
            origin,
            explanation: Report.Explanation.cases.Error.make({ error: "Segmenter initialization failed." })
          })
          return segmenterRegistry(module).pipe(
            Effect.catchTags({
              SegmenterSetupError: (error) =>
                Effect.fail(
                  Report.Diagnostic.make({
                    origin,
                    explanation: Report.Explanation.cases.Instruction.make({ instruction: error.instruction })
                  })
                ),
              SchemaError: () => Effect.fail(fallback)
            }),
            Effect.catchDefect(() => Effect.fail(fallback)),
            Effect.result,
            Effect.map((result) => [module, result] as const)
          )
        },
        { concurrency: "unbounded" }
      ),
      enrichmentSetups: Effect.forEach(
        modules.enrichments,
        (module) => {
          const origin = Report.DiagnosticOrigin.cases.EnrichmentSetup.make({ module })
          const fallback = Report.Diagnostic.make({
            origin,
            explanation: Report.Explanation.cases.Error.make({ error: "Enrichment initialization failed." })
          })
          return enrichmentRegistry(module).pipe(
            Effect.catchTags({
              EnrichmentSetupError: (error) =>
                Effect.fail(
                  Report.Diagnostic.make({
                    origin,
                    explanation: Report.Explanation.cases.Instruction.make({ instruction: error.instruction })
                  })
                ),
              SchemaError: () => Effect.fail(fallback)
            }),
            Effect.catchDefect(() => Effect.fail(fallback)),
            Effect.result,
            Effect.map((result) => [module, result] as const)
          )
        },
        { concurrency: "unbounded" }
      )
    },
    { concurrency: "unbounded" }
  )
  const segmentations = yield* Effect.forEach(
    Array.flatMap(setups.segmenterSetups, (entry) =>
      Result.isSuccess(entry[1]) ? [[entry[0], entry[1].success] as const] : []
    ),
    (entry) => {
      const [module, execute] = entry
      return Effect.forEach(
        request.changes,
        (entry, index) => {
          if (
            !Array.some(
              request.traits,
              (candidate) => candidate.trait.segment === module && entry.ignores?.[candidate.trait.name] === undefined
            )
          ) {
            return Effect.undefined
          }
          const origin = Report.DiagnosticOrigin.cases.SegmenterExecution.make({ module, change: index })
          const fallback = Report.Diagnostic.make({
            origin,
            explanation: Report.Explanation.cases.Error.make({
              error: "Segmentation failed or returned invalid inputs."
            })
          })
          return Segmentation.execute(execute, entry.change).pipe(
            Effect.catchTags({
              SegmenterError: (error) =>
                Effect.fail(
                  Report.Diagnostic.make({
                    origin,
                    explanation: Report.Explanation.cases.Instruction.make({ instruction: error.instruction })
                  })
                ),
              SchemaError: () => Effect.fail(fallback)
            }),
            Effect.catchDefect(() => Effect.fail(fallback)),
            Effect.result
          )
        },
        { concurrency: segmentationConcurrency }
      ).pipe(Effect.map((results) => [module, results] as const))
    },
    // Distinct segmenter modules are few; the per-change executions inside are bounded.
    { concurrency: "unbounded" }
  )
  return {
    enrichments: pipe(
      setups.enrichmentSetups,
      Array.flatMap((entry) => (Result.isSuccess(entry[1]) ? [[entry[0], entry[1].success] as const] : [])),
      (entries) => new Map(entries)
    ),
    setupDiagnostics: [
      ...Array.getFailures(Array.map(setups.segmenterSetups, (entry) => entry[1])),
      ...Array.getFailures(Array.map(setups.enrichmentSetups, (entry) => entry[1]))
    ],
    segmentations: new Map(segmentations)
  }
})
