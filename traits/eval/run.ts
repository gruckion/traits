#!/usr/bin/env node
/**
 * Measures trait-checking accuracy and cost against labeled fixtures with the workspace's configured models.
 *
 * Runs every labeled trait against every fixture through the public check API, then scores verdicts against the
 * labels: "fail" cases should fail, while "pass" and "unmatched" cases should not. With --all-traits, every workspace
 * trait is checked so labeled traits share batches with realistic neighbors, but only labeled traits are scored.
 * With --segment <module>, labeled traits use that segmenter, such as @traits/typescript/segmenter, without editing their
 * trait files. With --decision-model <model>, decisions use that OpenRouter model instead of the configured one.
 * Usage: node traits/eval/run.ts [--all-traits] [--segment <module>] [--decision-model <model>]
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Array, Clock, Console, DateTime, Effect, FileSystem, Layer, Path, pipe, Ref, Schema as S } from "effect"
import { DecisionModel } from "effect/ai"
import { Digest, SecureRandom } from "effect/crypto"
import { FetchHttpClient } from "effect/http"
import { KeyValueStore } from "effect/persistence"

import { check } from "../Check/Check.ts"
import { EnrichmentRegistry } from "../Enrichment/EnrichmentRegistry.ts"
import * as ExtensionModule from "../ExtensionModule.ts"
import * as Models from "../Models.ts"
import * as Report from "../Report/Report.ts"
import { SegmenterRegistry } from "../Segmenter/SegmenterRegistry.ts"
import { Trait } from "../Trait.ts"
import * as TraitFile from "../TraitFile.ts"
import { TraitName } from "../TraitName.ts"
import * as TraitsConfig from "../TraitsConfig.ts"
import { WorkspacePath } from "../util/util.ts"
import * as WorkspaceConfigProvider from "../WorkspaceConfigProvider.ts"
import * as WorkspaceLayout from "../WorkspaceLayout.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"
import * as WorkspaceTraits from "../WorkspaceTraits.ts"

const Label = S.Literals(["fail", "pass", "unmatched"])

/** Labeled fixtures: each fixture is a file snapshot checked at its logical path, labeled per trait. */
const Cases = S.Struct({
  traits: S.Array(TraitName),
  fixtures: S.Array(S.Struct({ id: S.String, path: WorkspacePath })),
  labels: S.Record(S.String, S.Record(S.String, Label))
})

const policies = [
  Report.DecisionPolicy.make({ fail: 0.5, pass: 0.5 }),
  Report.DecisionPolicy.make({ fail: 0.7, pass: 0.5 })
]

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? "n/a" : `${((100 * numerator) / denominator).toFixed(0)}%`

/** Counts decision requests reaching the configured (limited, retrying) decision model. */
const layerCountedDecisions = (requests: Ref.Ref<number>) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    Effect.gen(function* () {
      const model = yield* DecisionModel.DecisionModel
      return DecisionModel.DecisionModel.of({
        ...model,
        decide: (definition, options) =>
          Effect.andThen(
            Ref.update(requests, (n) => n + 1),
            model.decide(definition, options)
          ),
        decideSettled: (definition, options) =>
          Effect.andThen(
            Ref.update(requests, (n) => n + 1),
            model.decideSettled(definition, options)
          )
      })
    })
  )

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const cases = yield* fs
    .readFileString(path.join(import.meta.dirname, "cases.json"))
    .pipe(Effect.flatMap(S.decodeEffect(S.fromJsonString(Cases))))
  const configured = yield* TraitsConfig.load
  const modelIndex = process.argv.indexOf("--decision-model")
  const config =
    modelIndex === -1
      ? configured
      : {
          ...configured,
          models: {
            ...configured.models,
            decision: { provider: "openrouter" as const, model: process.argv[modelIndex + 1]! }
          }
        }
  const names = process.argv.includes("--all-traits") ? yield* WorkspaceTraits.all : cases.traits
  const segmentIndex = process.argv.indexOf("--segment")
  const segment =
    segmentIndex === -1
      ? undefined
      : yield* path
          .toFileUrl(path.resolve(WorkspaceLayout.config))
          .pipe(
            Effect.flatMap((baseUrl) =>
              ExtensionModule.resolve({ reference: process.argv[segmentIndex + 1]!, baseUrl })
            )
          )
  const traits = yield* Effect.forEach(names, (name) =>
    Effect.map(TraitFile.load(name), (trait) => ({
      trait: segment !== undefined && Array.contains(cases.traits, name) ? Trait.make({ ...trait, segment }) : trait
    }))
  )
  const changes = yield* Effect.forEach(cases.fixtures, (fixture) =>
    Effect.map(fs.readFileString(path.join(import.meta.dirname, "fixtures", `${fixture.id}.txt`)), (text) => ({
      change: { after: { path: fixture.path, text } }
    }))
  )
  const requests = yield* Ref.make(0)
  const models = layerCountedDecisions(requests).pipe(
    Layer.provideMerge(Models.layerDecisionLimit(config.concurrency)),
    Layer.provideMerge(Models.layer(config.models).pipe(Layer.provide(WorkspaceConfigProvider.layer)))
  )
  const started = yield* Clock.currentTimeMillis
  const report = yield* check({ traits, changes }).pipe(
    Effect.provide(Layer.mergeAll(SegmenterRegistry.layer, EnrichmentRegistry.layer).pipe(Layer.provideMerge(models)))
  )
  const seconds = yield* Clock.currentTimeMillis.pipe(Effect.map((finished) => (finished - started) / 1000))
  const requestCount = yield* Ref.get(requests)

  yield* Console.log(
    `${traits.length} traits x ${changes.length} fixtures in ${seconds.toFixed(0)}s, ${requestCount} decision requests, ${report.run.usage.inputTokens ?? "?"} input tokens, models ${pipe(report.run.models, Array.join(", "))}`
  )
  const cells = Array.flatMap(report.traits, (traitReport, traitIndex) =>
    Array.flatMap(cases.fixtures, (fixture, changeIndex) => {
      const label = cases.labels[traitReport.trait.name]?.[fixture.id]
      const change = traitReport.changes[changeIndex]!
      // Ruled out when every selected input was unmatched, including a segmenter selecting nothing.
      const ruledOut =
        Report.ChangeReport.guards.Evaluated(change) && Array.every(change.inputs, Report.InputReport.guards.Unmatched)
      return label === undefined ? [] : [{ trait: traitReport.trait.name, label, traitIndex, changeIndex, ruledOut }]
    })
  )
  const gated = Array.filter(cells, (cell) => cell.label === "unmatched")
  const missedByGate = Array.filter(cells, (cell) => cell.label === "fail" && cell.ruledOut)
  yield* Console.log(
    `subject gate: ruled out ${ratio(Array.filter(gated, (cell) => cell.ruledOut).length, gated.length)} of ${gated.length} unmatched cases; ruled out ${missedByGate.length} of ${Array.filter(cells, (cell) => cell.label === "fail").length} violations`
  )
  for (const policy of policies) {
    const verdicts = Report.verdicts(report, policy)
    const scored = Array.map(cells, (cell) => ({
      ...cell,
      verdict: verdicts.traits[cell.traitIndex]!.changes[cell.changeIndex]!.verdict ?? "Pass"
    }))
    const count = (label: "fail" | "clean", verdict: string) =>
      Array.filter(scored, (cell) => (label === "fail") === (cell.label === "fail") && cell.verdict === verdict).length
    const violations = Array.filter(scored, (cell) => cell.label === "fail").length
    const clean = scored.length - violations
    const truePositives = count("fail", "Fail")
    const falsePositives = count("clean", "Fail")
    yield* Console.log(
      `\npolicy fail>=${policy.fail} pass>=${policy.pass}: precision ${ratio(truePositives, truePositives + falsePositives)}, recall ${ratio(truePositives, violations)} (${truePositives}/${violations}), false positives ${falsePositives}/${clean} (${ratio(falsePositives, clean)}), inconclusive ${count("fail", "Inconclusive") + count("clean", "Inconclusive")}, incomplete ${count("fail", "Incomplete") + count("clean", "Incomplete")}`
    )
    for (const name of cases.traits) {
      const rows = Array.filter(scored, (cell) => cell.trait === name)
      const wrong = Array.filter(rows, (cell) => (cell.label === "fail") !== (cell.verdict === "Fail"))
      yield* Console.log(
        `  ${name}: ${rows.length - wrong.length}/${rows.length} correct${
          wrong.length === 0
            ? ""
            : `; wrong: ${pipe(
                wrong,
                Array.map((cell) => `${cases.fixtures[cell.changeIndex]!.id} (${cell.label}, got ${cell.verdict})`),
                Array.join(", ")
              )}`
        }`
      )
    }
  }
})

/** Host services for checks, with the repository root as the workspace; run from the repository root. */
const host = Layer.mergeAll(
  FetchHttpClient.layer,
  Digest.layerWebCrypto,
  SecureRandom.layerWebCrypto,
  KeyValueStore.layerMemory,
  DateTime.layerCurrentZoneLocal,
  WorkspaceRoot.layer(".")
).pipe(Layer.provideMerge(NodeServices.layer))

program.pipe(Effect.provide(host), NodeRuntime.runMain)
