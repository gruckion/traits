import { tmpdir } from "node:os"

import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Array,
  Cause,
  Context,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Scope,
  Schema as S,
  String,
  Types
} from "effect"
import { Chat, DecisionModel, LanguageModel } from "effect/ai"
import { Digest, SecureRandom } from "effect/crypto"
import { FetchHttpClient } from "effect/http"
import { KeyValueStore } from "effect/persistence"

import { check } from "../Check/Check.ts"
import { EnrichmentRegistry } from "../Enrichment/EnrichmentRegistry.ts"
import * as ExtensionModule from "../ExtensionModule.ts"
import * as Report from "../Report/Report.ts"
import { SegmenterSetupError } from "../Segmenter/Segmenter.ts"
import { SegmenterRegistry } from "../Segmenter/SegmenterRegistry.ts"
import { Trait } from "../Trait.ts"
import { TraitName } from "../TraitName.ts"
import { TraitPurpose } from "../TraitPurpose.ts"
import { WorkspacePath } from "../util/util.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"

const allInputsOf = (trait: Report.TraitReport) =>
  Array.flatMap(trait.changes, (change) => (Report.ChangeReport.guards.Evaluated(change) ? change.inputs : []))
/** Inputs that passed the subject gate, so their enrichments ran or were recorded. */
const inputsOf = (trait: Report.TraitReport) =>
  Array.flatMap(allInputsOf(trait), (input) => (Report.InputReport.guards.Unmatched(input) ? [] : [input]))

class Probe extends Context.Service<
  Probe,
  Types.Mutable<{
    readonly setups: number
    readonly executions: number
    readonly setupClosed: number
    readonly executionsClosed: number
    readonly chats: Array<Chat.Chat>
    readonly scopes: Array<unknown>
    readonly fail: boolean
    readonly started: Effect.Effect<void>
    readonly gate: Effect.Effect<void>
  }>
>()("traits/test/ExtensionRegistry.test/Probe") {}

const host = Layer.mergeAll(
  NodeServices.layer,
  Layer.succeed(DateTime.CurrentTimeZone, DateTime.zoneMakeOffset(0)),
  Layer.mock(DecisionModel.DecisionModel, { [DecisionModel.TypeId]: DecisionModel.TypeId }),
  Layer.mock(LanguageModel.LanguageModel, { [LanguageModel.TypeId]: LanguageModel.TypeId }),
  Digest.layerWebCrypto,
  Layer.mock(SecureRandom.SecureRandom, {}),
  FetchHttpClient.layer,
  KeyValueStore.layerMemory,
  WorkspaceRoot.layer(tmpdir()).pipe(Layer.provide(NodeServices.layer))
)

const moduleAt = Effect.fnUntraced(function* (filename: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { directory } = yield* WorkspaceRoot
  const canonical = yield* fs.realPath(filename)
  return WorkspacePath.make(path.relative(directory, canonical))
})

it.live("resolves relative and consumer-only import-condition packages before using real registries", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-consumer-resolution-" })
      const traitDirectory = path.join(directory, ".agents", "traits")
      const packageDirectory = path.join(directory, "node_modules", "@traits-resolution-test", "consumer-only")
      yield* fs.makeDirectory(traitDirectory, { recursive: true })
      yield* fs.makeDirectory(packageDirectory, { recursive: true })
      yield* fs.writeFileString(
        path.join(directory, "package.json"),
        JSON.stringify({
          type: "module",
          imports: { "#segmenter": "@traits-resolution-test/consumer-only/segmenter" }
        })
      )
      yield* fs.writeFileString(
        path.join(packageDirectory, "package.json"),
        JSON.stringify({
          name: "@traits-resolution-test/consumer-only",
          type: "module",
          exports: {
            "./segmenter": { import: "./segmenter.mjs", require: "./wrong.cjs" },
            "./enricher": { import: "./enricher.mjs" }
          }
        })
      )
      const effect = JSON.stringify(import.meta.resolve("effect"))
      yield* fs.writeFileString(
        path.join(packageDirectory, "segmenter.mjs"),
        `import { Effect } from ${effect}; export default Effect.succeed((change) => Effect.succeed([{ _tag: "After", range: { start: 0, end: change.after.text.length } }]));`
      )
      yield* fs.writeFileString(
        path.join(packageDirectory, "enricher.mjs"),
        `import { Effect } from ${effect}; export default Effect.succeed(Effect.succeed("package context"));`
      )
      yield* fs.writeFileString(
        path.join(packageDirectory, "wrong.cjs"),
        `throw new Error("Wrong resolution conditions");`
      )
      yield* fs.writeFileString(
        path.join(traitDirectory, "local.mjs"),
        `import { Effect } from ${effect}; export default Effect.succeed(Effect.succeed("relative context"));`
      )
      const baseUrl = yield* path.toFileUrl(path.join(traitDirectory, "example.md"))
      const segment = yield* ExtensionModule.resolve({
        reference: "@traits-resolution-test/consumer-only/segmenter",
        baseUrl
      })
      const enricher = yield* ExtensionModule.resolve({
        reference: "@traits-resolution-test/consumer-only/enricher",
        baseUrl
      })
      const local = yield* ExtensionModule.resolve({ reference: "./local.mjs", baseUrl })
      const expectedSegment = yield* moduleAt(path.join(packageDirectory, "segmenter.mjs"))
      expect(segment).toBe(expectedSegment)
      const segmentUrl = yield* fs
        .realPath(path.join(packageDirectory, "segmenter.mjs"))
        .pipe(Effect.flatMap(path.toFileUrl))
      const canonical = yield* ExtensionModule.resolve({ reference: segmentUrl.href, baseUrl })
      expect(canonical).toBe(segment)
      const alias = yield* ExtensionModule.resolve({ reference: "#segmenter", baseUrl })
      expect(alias).toBe(segment)
      const report = yield* check({
        traits: [
          {
            trait: Trait.make({
              name: TraitName.make("consumer"),
              purpose: TraitPurpose.make("Protect correctness."),
              segment,
              enrichments: [enricher, local]
            })
          }
        ],
        changes: [{ change: { after: { path: WorkspacePath.make("source.ts"), text: "source" } } }]
      }).pipe(Effect.provide([SegmenterRegistry.layer, EnrichmentRegistry.layer]))
      expect(report.diagnostics).toEqual([])
      expect(inputsOf(report.traits[0]!)[0]!.enrichments).toEqual([
        { _tag: "Succeeded", module: enricher, text: "package context" },
        { _tag: "Succeeded", module: local, text: "relative context" }
      ])
      const unavailable = yield* ExtensionModule.resolve({
        reference: "@traits-resolution-test/consumer-only/segmenter",
        baseUrl: new URL(import.meta.url)
      }).pipe(Effect.result)
      expect(Result.isFailure(unavailable)).toBe(true)
      if (Result.isFailure(unavailable)) {
        expect(unavailable.failure._tag).toBe("ModuleResolutionError")
      }
    })
  ).pipe(Effect.provide(host))
)

it.live("closes resources from interrupted setup when the registry shuts down", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const module = yield* fixture
      const state = probe()
      const started = yield* Deferred.make<void>()
      state.started = Deferred.succeed(started, undefined).pipe(Effect.asVoid)
      state.gate = Effect.never
      const parent = yield* Scope.Scope
      const registryScope = yield* Scope.fork(parent)
      const registry = yield* Layer.build(SegmenterRegistry.layer).pipe(
        Effect.map(Context.get(SegmenterRegistry)),
        Effect.provideService(Probe, state),
        Scope.provide(registryScope)
      )
      const waiting = yield* registry(module).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      yield* Scope.close(registryScope, Exit.void)
      const exit = yield* Fiber.await(waiting)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(state.setupClosed).toBe(1)
    })
  ).pipe(Effect.provide(host))
)

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-extension-registry-" })
  const filename = path.join(directory, "segmenter.mjs")
  const source = String.stripMargin(`
  |import { Context, Effect, Scope } from ${JSON.stringify(import.meta.resolve("effect"))};
  |import { Chat } from ${JSON.stringify(import.meta.resolve("effect/ai"))};
  |import { SegmenterSetupError } from ${JSON.stringify(import.meta.resolve("../Segmenter/Segmenter.ts"))};
  |const Probe = Context.Service("traits/test/ExtensionRegistry.test/Probe");
  |export default Effect.gen(function* () {
  |  const probe = yield* Probe;
  |  probe.setups++;
  |  yield* Effect.addFinalizer(() => Effect.sync(() => { probe.setupClosed++; }));
  |  yield* probe.started;
  |  yield* probe.gate;
  |  if (probe.fail) {
  |    return yield* SegmenterSetupError.make({ instruction: "Restore the dependency and restart." });
  |  }
  |  return Effect.fnUntraced(function* () {
  |    probe.executions++;
  |    const chat = yield* Chat.Chat;
  |    const scope = yield* Scope.Scope;
  |    probe.chats.push(chat);
  |    probe.scopes.push(scope);
  |    yield* Effect.addFinalizer(() => Effect.sync(() => { probe.executionsClosed++; }));
  |    return [];
  |  });
  |});
  `)
  yield* fs.writeFileString(filename, source)
  return yield* moduleAt(filename)
})

const probe = () =>
  Probe.of({
    setups: 0,
    executions: 0,
    setupClosed: 0,
    executionsClosed: 0,
    chats: [],
    scopes: [],
    fail: false,
    started: Effect.void,
    gate: Effect.void
  })

it.live("shares setup while isolating execution chats/scopes and owning setup resources until shutdown", () =>
  Effect.gen(function* () {
    const state = probe()
    yield* Effect.scoped(
      Effect.gen(function* () {
        const module = yield* fixture
        const registry = yield* Layer.build(SegmenterRegistry.layer).pipe(Effect.map(Context.get(SegmenterRegistry)))
        const { one, two } = yield* Effect.all(
          { one: registry(module), two: registry(module) },
          { concurrency: "unbounded" }
        )
        expect(state.setups).toBe(1)
        yield* Effect.all(
          [
            one({ after: { path: WorkspacePath.make("one.ts"), text: "" } }),
            two({ after: { path: WorkspacePath.make("two.ts"), text: "" } })
          ],
          { concurrency: "unbounded" }
        )
        expect(state.executions).toBe(2)
        expect(state.executionsClosed).toBe(2)
        expect(state.setupClosed).toBe(0)
        expect(state.chats[0]).not.toBe(state.chats[1])
        expect(state.scopes[0]).not.toBe(state.scopes[1])
        yield* registry(module)
        expect(state.setups).toBe(1)
        const request = {
          traits: [
            {
              trait: Trait.make({
                name: TraitName.make("example"),
                purpose: TraitPurpose.make("Protect correctness."),
                segment: module
              })
            }
          ],
          changes: [{ change: { after: { path: WorkspacePath.make("file.ts"), text: "" } } }]
        }
        yield* check(request).pipe(
          Effect.provideService(SegmenterRegistry, registry),
          Effect.provide(EnrichmentRegistry.layer)
        )
        yield* check(request).pipe(
          Effect.provideService(SegmenterRegistry, registry),
          Effect.provide(EnrichmentRegistry.layer)
        )
        expect(state.setups).toBe(1)
        expect(state.executions).toBe(4)
      }).pipe(Effect.provideService(Probe, state))
    )
    expect(state.setupClosed).toBe(1)
  }).pipe(Effect.provide(host))
)

it.live("retains setup failures and does not cancel shared initialization when one waiter is interrupted", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const module = yield* fixture
      const state = probe()
      const started = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      state.started = Deferred.succeed(started, undefined).pipe(Effect.asVoid)
      state.gate = Deferred.await(gate)
      const registry = yield* Layer.build(SegmenterRegistry.layer).pipe(
        Effect.map(Context.get(SegmenterRegistry)),
        Effect.provideService(Probe, state)
      )
      const first = yield* registry(module).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      yield* Fiber.interrupt(first)
      yield* Deferred.succeed(gate, undefined)
      const execute = yield* registry(module)
      yield* execute({ after: { path: WorkspacePath.make("file.ts"), text: "" } })
      expect(state.setups).toBe(1)

      const failedModule = yield* fixture
      state.fail = true
      const firstFailure = yield* registry(failedModule).pipe(Effect.exit)
      expect(state.setupClosed).toBe(1)
      state.fail = false
      const repeatedFailure = yield* registry(failedModule).pipe(Effect.exit)
      expect(Exit.isFailure(firstFailure)).toBe(true)
      expect(Exit.isFailure(repeatedFailure)).toBe(true)
      if (Exit.isFailure(firstFailure) && Exit.isFailure(repeatedFailure)) {
        const original = Option.getOrUndefined(Cause.findErrorOption(firstFailure.cause))
        expect(original).toBeInstanceOf(SegmenterSetupError)
        expect(Option.getOrUndefined(Cause.findErrorOption(repeatedFailure.cause))).toBe(original)
      }
      expect(state.setups).toBe(2)
      expect(state.setupClosed).toBe(1)
    })
  ).pipe(Effect.provide(host))
)

it.live("reuses real enrichment setup while isolating input context, chats, and execution resources", () =>
  Effect.gen(function* () {
    const state = probe()
    yield* Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-enrichment-registry-" })
        const filename = path.join(directory, "enrichment.mjs")
        const source = String.stripMargin(`
        |import { Context, Effect, Scope } from ${JSON.stringify(import.meta.resolve("effect"))};
        |import { Chat } from ${JSON.stringify(import.meta.resolve("effect/ai"))};
        |import { EnrichmentContext } from ${JSON.stringify(import.meta.resolve("../Enrichment/EnrichmentContext.ts"))};
        |const Probe = Context.Service("traits/test/ExtensionRegistry.test/Probe");
        |export default Effect.gen(function* () {
        |  const probe = yield* Probe;
        |  probe.setups++;
        |  yield* Effect.addFinalizer(() => Effect.sync(() => { probe.setupClosed++; }));
        |  return Effect.gen(function* () {
        |    const context = yield* EnrichmentContext;
        |    probe.executions++;
        |    const chat = yield* Chat.Chat;
        |    const scope = yield* Scope.Scope;
        |    probe.chats.push(chat);
        |    probe.scopes.push(scope);
        |    yield* Effect.addFinalizer(() => Effect.sync(() => { probe.executionsClosed++; }));
        |    return context.input.change.after.path === "invalid.ts" ? { secret: "private-result" } : context.input.change.after.path;
        |  });
        |});
        `)
        yield* fs.writeFileString(filename, source)
        const module = yield* moduleAt(filename)
        const services = yield* Layer.build(Layer.merge(SegmenterRegistry.layer, EnrichmentRegistry.layer)).pipe(
          Effect.provideService(Probe, state)
        )
        for (const filename of ["one.ts", "two.ts"]) {
          const report = yield* check({
            traits: [
              {
                trait: Trait.make({
                  name: TraitName.make("example"),
                  purpose: TraitPurpose.make("Protect correctness."),
                  enrichments: [module]
                })
              }
            ],
            changes: [{ change: { after: { path: WorkspacePath.make(filename), text: "" } } }]
          }).pipe(Effect.provideContext(services))
          expect(inputsOf(report.traits[0]!)[0]).toEqual(
            expect.objectContaining({ _tag: "Completed", enrichments: [{ _tag: "Succeeded", module, text: filename }] })
          )
        }
        const invalid = yield* check({
          traits: [
            {
              trait: Trait.make({
                name: TraitName.make("example"),
                purpose: TraitPurpose.make("Protect correctness."),
                enrichments: [module]
              })
            }
          ],
          changes: [{ change: { after: { path: WorkspacePath.make("invalid.ts"), text: "" } } }]
        }).pipe(Effect.provideContext(services))
        expect(inputsOf(invalid.traits[0]!)[0]!.enrichments).toEqual([
          { _tag: "Failed", module, explanation: { _tag: "Error", error: "Enrichment execution failed." } }
        ])
        expect(invalid.diagnostics).toEqual([])
        expect(JSON.stringify(invalid)).not.toContain("private-result")
        expect(state.setups).toBe(1)
        expect(state.executions).toBe(3)
        expect(state.executionsClosed).toBe(3)
        expect(state.setupClosed).toBe(0)
        expect(state.chats[0]).not.toBe(state.chats[1])
        expect(state.scopes[0]).not.toBe(state.scopes[1])
      })
    )
    expect(state.setupClosed).toBe(1)
  }).pipe(Effect.provide(host))
)

it.live("preserves module/setup validation errors while rejecting wrong-stage setup errors as defects", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-invalid-extension-" })
      const registry = yield* Layer.build(SegmenterRegistry.layer).pipe(Effect.map(Context.get(SegmenterRegistry)))
      const sources = [
        "export default {};",
        `import { Effect } from ${JSON.stringify(import.meta.resolve("effect"))}; export default Effect.succeed(null);`,
        `import { EnrichmentSetupError } from ${JSON.stringify(import.meta.resolve("../Enrichment/Enrichment.ts"))}; export default EnrichmentSetupError.make({ instruction: "Restore the dependency." });`
      ]
      for (const [index, source] of sources.entries()) {
        const filename = path.join(directory, `${index}.mjs`)
        yield* fs.writeFileString(filename, source)
        const module = yield* moduleAt(filename)
        const exit = yield* registry(module).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBe(index === 2)
          expect(Cause.hasFails(exit.cause)).toBe(index !== 2)
          if (index !== 2) {
            expect(S.isSchemaError(Option.getOrUndefined(Cause.findErrorOption(exit.cause)))).toBe(true)
          }
        }
      }
    })
  ).pipe(Effect.provide(host))
)
