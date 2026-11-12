// Tinybench runs actual Effect store APIs; revision loading is isolated to the typed module adapter below.
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"

import { NodeServices } from "@effect/platform-node"
import {
  Array,
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  pipe,
  type PlatformError,
  Result,
  Schedule,
  Schema as S,
  Stream,
  String,
  Semaphore,
  identity
} from "effect"
import { DecisionModel, LanguageModel } from "effect/ai"
import { Reactivity } from "effect/reactivity"
import { Bench } from "tinybench"
import type * as TraitTypes from "traits-prev/Trait"
import type { TraitStore } from "traits-prev/TraitStore"

import * as Model from "./model.ts"

type StoreApi = Pick<TraitStore["Service"], "ls" | "get" | "add" | "update" | "rm"> & {
  readonly refresh?: TraitStore["Service"]["refresh"] | undefined
}
interface MainStoreModule {
  readonly TraitStore: Context.Key<TraitStore, StoreApi>
  readonly layerFileSystem: (
    directory: string
  ) => Layer.Layer<TraitStore, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path>
}

interface Task {
  readonly name: Model.Workload
  readonly run: () => Promise<unknown>
  readonly validate: () => Promise<void>
}
const task = <A>(name: Model.Workload, run: () => Promise<A>, validate: (value: A) => void): Task => ({
  name,
  run,
  validate: () => run().then(validate)
})

const output = await Effect.runPromise(
  Effect.gen(function* () {
    const options = yield* pipe(process.argv[2] ?? "", S.decodeEffect(S.fromJsonString(Model.WorkerOptions)))
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const fixture = yield* fs
      .readFileString(path.join(options.fixture, "expected.json"))
      .pipe(Effect.flatMap(S.decodeUnknownEffect(S.fromJsonString(Model.Fixture))))
    // Module paths point to trusted Git checkouts. Main's layer is a factory; head's is a value.
    // Revisions before the rename keep the legacy package in traits/ rather than traits-prev/.
    const renamed = yield* fs.exists(path.join(options.source, "traits-prev"))
    const legacy = renamed ? "traits-prev" : "traits"
    const importModule = <A>(file: string): Promise<A> =>
      import(pathToFileURL(path.join(options.source, legacy, file)).href)
    const directory = yield* fs.makeTempDirectoryScoped({ directory: "/tmp/opencode", prefix: "traits-bench-worker-" })
    yield* fs.copy(path.join(options.fixture, "traits"), directory)
    const io = { reads: 0, scans: 0, watchEvents: 0, markdownEvents: 0 }
    const trackedFs = FileSystem.FileSystem.of({
      ...fs,
      readFileString: (file, encoding) => {
        if (pipe(file, String.startsWith(directory)) && pipe(file, String.endsWith(".md"))) io.reads++
        return fs.readFileString(file, encoding)
      },
      readDirectory: (file) => {
        if (file === directory) io.scans++
        return fs.readDirectory(file)
      },
      watch: (file, settings) =>
        fs.watch(file, settings).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              io.watchEvents++
              if (pipe(event.path, String.endsWith(".md"))) io.markdownEvents++
            })
          )
        )
    })
    const memoryBefore = process.memoryUsage()
    const importStart = performance.now()
    let storeTag: Context.Key<TraitStore, StoreApi>
    let layer: Layer.Layer<TraitStore, never, NodeServices.NodeServices | Reactivity.Reactivity>
    let Database: typeof import("../../traits-prev/TraitDatabase.ts") | undefined
    if (options.variant === "main-fs") {
      const Store = yield* Effect.promise(() => importModule<MainStoreModule>("TraitStore.ts"))
      storeTag = Store.TraitStore
      layer = Store.layerFileSystem(directory).pipe(Layer.orDie)
    } else {
      const Store = yield* Effect.promise(() => importModule<typeof import("traits-prev/TraitStore")>("TraitStore.ts"))
      storeTag = Store.TraitStore
      const Paths = yield* Effect.promise(() =>
        importModule<typeof import("traits-prev/ProjectPaths")>("ProjectPaths.ts")
      )
      const ContextModule = yield* Effect.promise(() =>
        importModule<typeof import("traits-prev/TraitsContext")>("TraitsContext.ts")
      )
      Database = yield* Effect.promise(() =>
        importModule<typeof import("../../traits-prev/TraitDatabase.ts")>("TraitDatabase.ts")
      )
      layer = Store.layer.pipe(
        Layer.provide(
          Layer.effect(
            ContextModule.TraitsContext,
            Effect.gen(function* () {
              const asFileRead =
                options.fileReadConcurrency === "unbounded"
                  ? identity
                  : yield* Semaphore.make(options.fileReadConcurrency).pipe(
                      Effect.map((semaphore) => semaphore.withPermits(1))
                    )
              return {
                asDecision: identity,
                asFileRead,
                configRoot: directory,
                excludes: [],
                config: {
                  decisionConcurrency: 1,
                  fileReadConcurrency: options.fileReadConcurrency,
                  excludeGitignored: true,
                  excludes: [],
                  layerDecisionModel: Layer.effect(
                    DecisionModel.DecisionModel,
                    Effect.die("No model requests in storage benchmarks")
                  ),
                  layerLanguageModel: Layer.effect(
                    LanguageModel.LanguageModel,
                    Effect.die("No model requests in storage benchmarks")
                  )
                }
              }
            })
          )
        ),
        Layer.provideMerge(Database.layer),
        Layer.provide(Layer.succeed(Paths.ProjectPaths, { projectRoot: directory, traitsDirectory: directory })),
        Layer.orDie
      )
    }
    const Trait = yield* Effect.promise(() => importModule<typeof import("traits-prev/Trait")>("Trait.ts"))
    const importMs = performance.now() - importStart
    const buildStart = performance.now()
    const scope = yield* Effect.scope
    const context = yield* Layer.buildWithScope(
      layer.pipe(
        Layer.provide(Layer.succeed(FileSystem.FileSystem, trackedFs)),
        Layer.provideMerge(Layer.mergeAll(NodeServices.layer, Reactivity.layer))
      ),
      scope
    )
    const run = Effect.runPromiseWith(context)
    const store = yield* Effect.promise(() => run(storeTag))
    const buildMs = performance.now() - buildStart
    const firstStart = performance.now()
    const first = yield* Effect.promise(() => run(store.ls))
    const firstListMs = performance.now() - firstStart
    assert.deepEqual(JSON.parse(JSON.stringify(first)), fixture.records)
    const memoryAfter = process.memoryUsage()
    const names = Array.map(fixture.records, (trait) => trait.name)
    let cursor = 0
    let sink = 0
    const matches = (trait: TraitTypes.Trait) =>
      Array.some([trait.name, trait.subject, trait.requirement, trait.purpose, trait.context ?? ""], (text) =>
        pipe(text, String.includes(fixture.query))
      )
    const expectedMatches = pipe(
      fixture.records,
      Array.filter((record) => matches({ ...record, name: Trait.TraitName.make(record.name) })),
      Array.map((record) => record.name)
    )
    const original = Trait.Trait.make({ ...fixture.records[0]!, name: Trait.TraitName.make(fixture.records[0]!.name) })
    const key = original.name
    const missing = Trait.TraitName.make("benchmark-missing-trait")
    const parallelNames = Array.take(names, 16)
    const tasks: Array<Task> = [
      task(
        "get",
        () => run(store.get(Trait.TraitName.make(names[cursor++ % names.length]!))),
        (result) => assert.ok(names.includes(result.name))
      ),
      task(
        "get-missing",
        () => run(store.get(missing).pipe(Effect.result)),
        (result) => assert.equal(Result.isFailure(result) ? result.failure._tag : undefined, "TraitNotFoundError")
      ),
      task(
        "ls",
        () => run(store.ls),
        (result) =>
          assert.deepEqual(
            Array.map(result, (trait) => trait.name),
            names
          )
      ),
      task(
        "list-filter",
        () => run(store.ls.pipe(Effect.map(Array.filter(matches)))),
        (result) =>
          assert.deepEqual(
            Array.map(result, (trait) => trait.name),
            expectedMatches
          )
      ),
      task(
        "list-json",
        () => run(store.ls.pipe(Effect.map(JSON.stringify))),
        (result) => assert.deepEqual(JSON.parse(result), fixture.records)
      ),
      task(
        "get-16-concurrent",
        () =>
          run(
            Effect.forEach(parallelNames, (name) => store.get(Trait.TraitName.make(name)), { concurrency: "unbounded" })
          ),
        (result) =>
          assert.deepEqual(
            Array.map(result, (trait) => trait.name),
            parallelNames
          )
      )
    ]
    const measure = Effect.fnUntraced(function* (workload: Task) {
      yield* Effect.promise(workload.validate)
      const ioBefore = { ...io }
      const bench = new Bench({
        time: options.timeMs,
        iterations: options.iterations,
        warmupTime: options.warmupMs,
        warmupIterations: options.warmupIterations,
        timestampProvider: "hrtimeNow"
      })
      bench.add(
        workload.name,
        () =>
          workload.run().then((value) => {
            sink += value === undefined ? 1 : 2
          }),
        { async: true }
      )
      yield* Effect.promise(() => bench.run())
      const ioAfter = { ...io }
      const measured = bench.tasks[0]!
      const result = measured.result
      if (result.state !== "completed") return yield* Effect.die(new Error(`${workload.name}: ${result.state}`))
      yield* Effect.promise(workload.validate)
      return {
        name: workload.name,
        meanMs: result.totalTime / measured.runs,
        p50Ms: result.latency.p50,
        p99Ms: result.latency.p99,
        samples: measured.runs,
        rme: result.latency.rme,
        ioIncludingWarmup: {
          reads: ioAfter.reads - ioBefore.reads,
          scans: ioAfter.scans - ioBefore.scans,
          watchEvents: ioAfter.watchEvents - ioBefore.watchEvents,
          markdownEvents: ioAfter.markdownEvents - ioBefore.markdownEvents
        }
      } satisfies Model.Measurement
    })
    const results: Array<Model.Measurement> = []
    if (options.refreshOnly) {
      const measured = yield* measure(
        task(
          "full-refresh",
          () => run(store.refresh ?? store.ls),
          (result) => {
            if (result !== undefined) assert.deepEqual(JSON.parse(JSON.stringify(result)), fixture.records)
          }
        )
      )
      results.push(measured)
      const refreshed = yield* Effect.promise(() => run(store.ls))
      assert.deepEqual(JSON.parse(JSON.stringify(refreshed)), fixture.records)
    } else {
      const reads = yield* Effect.forEach(tasks, measure)
      results.push(...reads)
      let version = 0
      const updateResult = yield* measure(
        task(
          "update",
          () =>
            run(
              store.update(
                Trait.Trait.make({
                  ...original,
                  requirement: `${original.requirement}\nBenchmark revision ${++version}.`
                })
              )
            ),
          (result) => assert.equal(result, undefined)
        )
      )
      results.push(updateResult)
      const updated = yield* Effect.promise(() => run(store.get(key)))
      assert.equal(updated.requirement, `${original.requirement}\nBenchmark revision ${version}.`)
      const cycle = Trait.Trait.make({ ...original, name: Trait.TraitName.make("benchmark-write-cycle") })
      const cycleResult = yield* measure(
        task(
          "add-remove-cycle",
          () =>
            run(
              Effect.gen(function* () {
                yield* store.add(cycle)
                yield* store.rm([cycle.name])
              })
            ),
          (result) => assert.equal(result, undefined)
        )
      )
      results.push(cycleResult)
      let externalVersion = 0
      const externalResult = yield* measure(
        task(
          "external-replace-visible",
          () =>
            run(
              Effect.gen(function* () {
                const replacement = Trait.Trait.make({
                  ...original,
                  requirement: `${original.requirement}\nExternal revision ${++externalVersion}.`
                })
                const temporary = path.join(directory, ".benchmark-replacement")
                yield* fs.writeFileString(temporary, Trait.serialize(replacement))
                yield* fs.rename(temporary, path.join(directory, `${original.name}.md`))
                return yield* store.get(key).pipe(
                  Effect.filterOrFail(
                    (value) => value.requirement === replacement.requirement,
                    () => "Waiting for synchronization"
                  ),
                  Effect.retry({ schedule: Schedule.spaced("1 millis"), times: 10_000 })
                )
              })
            ),
          (result) => assert.equal(result.requirement, `${original.requirement}\nExternal revision ${externalVersion}.`)
        )
      )
      results.push(externalResult)
      const updateRead = yield* measure(
        task(
          "update-read",
          () =>
            run(
              Effect.gen(function* () {
                const replacement = Trait.Trait.make({
                  ...original,
                  requirement: `${original.requirement}\nBenchmark revision ${++version}.`
                })
                yield* store.update(replacement)
                return yield* store.get(key)
              })
            ),
          (result) => assert.equal(result.requirement, `${original.requirement}\nBenchmark revision ${version}.`)
        )
      )
      results.push(updateRead)
      const updateBurst = yield* measure(
        task(
          "update-burst-16",
          () =>
            run(
              Effect.forEach(
                parallelNames,
                (name) =>
                  store.update(
                    Trait.Trait.make({
                      ...original,
                      name: Trait.TraitName.make(name),
                      requirement: `${original.requirement}\nBenchmark revision ${++version}.`
                    })
                  ),
                { discard: true }
              )
            ),
          (result) => assert.equal(result, undefined)
        )
      )
      results.push(updateBurst)
      const externalBurst = yield* measure(
        task(
          "external-burst-16-visible",
          () =>
            run(
              Effect.gen(function* () {
                const requirement = `${original.requirement}\nExternal burst ${++externalVersion}.`
                yield* Effect.forEach(
                  parallelNames,
                  (name) =>
                    Effect.gen(function* () {
                      const replacement = Trait.Trait.make({
                        ...original,
                        name: Trait.TraitName.make(name),
                        requirement
                      })
                      const temporary = path.join(directory, ".benchmark-replacement")
                      yield* fs.writeFileString(temporary, Trait.serialize(replacement))
                      yield* fs.rename(temporary, path.join(directory, `${name}.md`))
                    }),
                  { discard: true }
                )
                return yield* Effect.forEach(parallelNames, (name) => store.get(Trait.TraitName.make(name))).pipe(
                  Effect.filterOrFail(
                    (traits) => Array.every(traits, (trait) => trait.requirement === requirement),
                    () => "Waiting for burst synchronization"
                  ),
                  Effect.retry({ schedule: Schedule.spaced("1 millis"), times: 10_000 })
                )
              })
            ),
          (traits) =>
            assert.ok(
              Array.every(
                traits,
                (trait) => trait.requirement === `${original.requirement}\nExternal burst ${externalVersion}.`
              )
            )
        )
      )
      results.push(externalBurst)
    }
    let databaseBytes = 0
    if (Database !== undefined) {
      // The runtime context retains the concrete database through provideMerge; only the public store is used in timings.
      const database = Context.getUnsafe(context, Database.TraitDatabase)
      const config = database.$client.config
      assert.ok("url" in config)
      if (config.url.toString() !== "file::memory:") {
        const file = yield* path.fromFileUrl(new URL(config.url))
        for (const suffix of ["", "-wal", "-shm", "-journal"])
          if (yield* fs.exists(file + suffix)) {
            const stat = yield* fs.stat(file + suffix)
            databaseBytes += Number(stat.size)
          }
      }
    }
    return {
      variant: options.variant,
      round: options.round,
      count: names.length,
      source: options.source,
      fixtureBytes: fixture.bytes,
      matches: expectedMatches.length,
      startup: { importMs, buildMs, firstListMs, totalMs: importMs + buildMs + firstListMs },
      memory: {
        rssDelta: memoryAfter.rss - memoryBefore.rss,
        heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed
      },
      databaseBytes,
      results,
      sink
    } satisfies Model.WorkerResult
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)
process.stdout.write(`${JSON.stringify(output)}\n`)
