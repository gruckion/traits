import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { sql } from "drizzle-orm"
import {
  Array,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Queue,
  Result,
  Schedule,
  Semaphore,
  identity,
  Stream
} from "effect"
import { DecisionModel, LanguageModel } from "effect/ai"
import { Reactivity } from "effect/reactivity"

import { ProjectPaths } from "../ProjectPaths.ts"
import { T } from "../tables/index.ts"
import * as Trait from "../Trait.ts"
import * as TraitDatabase from "../TraitDatabase.ts"
import { TraitsContext } from "../TraitsContext.ts"
import * as TraitStore from "../TraitStore.ts"
import { databaseDirectory } from "./fixtures/databaseDirectory.ts"

const watchReady = Stream.make({ _tag: "Create", path: ".traits-watch-ready" } satisfies FileSystem.WatchEvent)

const layerStoreLibsql = (dir: string, watchChanges = false, fileReadConcurrency = 16, databaseFile?: string) =>
  TraitStore.layer.pipe(
    Layer.provide(
      Layer.effect(
        TraitsContext,
        Effect.gen(function* () {
          const semaphore = yield* Semaphore.make(fileReadConcurrency)
          return {
            asDecision: identity,
            asFileRead: semaphore.withPermits(1),
            configRoot: dir,
            excludes: [],
            config: {
              decisionConcurrency: 1,
              fileReadConcurrency,
              excludeGitignored: true,
              excludes: [],
              layerDecisionModel: Layer.effect(
                DecisionModel.DecisionModel,
                Effect.die("No model requests in storage tests")
              ),
              layerLanguageModel: Layer.effect(
                LanguageModel.LanguageModel,
                Effect.die("No model requests in storage tests")
              )
            }
          }
        })
      )
    ),
    Layer.provideMerge(databaseFile === undefined ? TraitDatabase.layer : TraitDatabase.layerFile(databaseFile)),
    Layer.provide(Reactivity.layer),
    Layer.provide(Layer.succeed(ProjectPaths, { projectRoot: dir, traitsDirectory: dir })),
    Layer.provide(
      Layer.effect(
        FileSystem.FileSystem,
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          return watchChanges
            ? fs
            : FileSystem.FileSystem.of({ ...fs, watch: () => Stream.concat(watchReady, Stream.never) })
        })
      )
    )
  )

const awaitTraits = Effect.fn("test.awaitTraits")(function* (matches: (traits: ReadonlyArray<Trait.Trait>) => boolean) {
  const store = yield* TraitStore.TraitStore
  return yield* store.ls.pipe(
    Effect.filterOrFail(matches, (traits) => `Waiting for trait synchronization; observed ${JSON.stringify(traits)}`),
    Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 300 })
  )
})

it.effect(
  "shares persistent storage with telemetry and preserves exports across index rebuilds",
  Effect.fnUntraced(
    function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* databaseDirectory("traits-shared-storage-")
      const directory = path.join(root, ".agents", "traits")
      const databaseFile = path.join(root, ".agents", "traits", "traits.sqlite")
      const payload = Buffer.from('{"resourceLogs":[]}')
      yield* Effect.gen(function* () {
        const db = yield* TraitDatabase.TraitDatabase
        yield* db
          .insert(T.runs)
          .values({ id: "existing-run", sectionId: "worker", command: ["node"], cwd: root, startedAt: 1 })
        yield* db
          .insert(T.exports)
          .values({ runId: "existing-run", signal: "logs", contentType: "application/json", receivedAt: 2, payload })
        // Simulate the earlier telemetry-only database, which had no trait table.
        yield* db.run(sql`DROP TABLE traits`)
      }).pipe(Effect.provide(TraitDatabase.layerFile(databaseFile)))
      const trait = Trait.Trait.make({
        name: Trait.TraitName.make("shared-storage"),
        subject: "Storage.",
        requirement: "Keep telemetry during index rebuilds.",
        purpose: "Preserve debugging history."
      })
      yield* fs.makeDirectory(directory, { recursive: true })
      yield* fs.writeFileString(path.join(directory, "shared-storage.md"), Trait.serialize(trait))
      yield* Effect.gen(function* () {
        const store = yield* TraitStore.TraitStore
        const db = yield* TraitDatabase.TraitDatabase
        const indexed = yield* store.ls
        expect(indexed).toEqual([trait])
        const updated = Trait.Trait.make({ ...trait, requirement: "Updated requirement." })
        yield* store.update(updated)
        yield* store.refresh
        const exports = yield* db.select().from(T.exports)
        expect(exports).toHaveLength(1)
        expect(Buffer.from(exports[0]!.payload)).toEqual(payload)
      }).pipe(Effect.provide(layerStoreLibsql(directory, false, 16, databaseFile)))
      yield* Effect.gen(function* () {
        const db = yield* TraitDatabase.TraitDatabase
        const indexed = yield* db.select().from(T.traits)
        const runs = yield* db.select().from(T.runs)
        const exports = yield* db.select().from(T.exports)
        expect(indexed).toMatchObject([{ name: trait.name, requirement: "Updated requirement." }])
        expect(runs).toMatchObject([{ id: "existing-run" }])
        expect(exports).toHaveLength(1)
      }).pipe(Effect.provide(TraitDatabase.layerFile(databaseFile)))
    },
    Effect.provide([NodeServices.layer, Reactivity.layer])
  )
)

it.live(
  "hydrates once after watcher readiness and includes changes made before registration",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-watch-startup-" })
    const requested = yield* Deferred.make<void>()
    const register = yield* Deferred.make<void>()
    const trait = Trait.Trait.make({
      name: Trait.TraitName.make("startup"),
      subject: "Startup.",
      requirement: "Original.",
      purpose: "Synchronize once."
    })
    const file = path.join(dir, "startup.md")
    yield* fs.writeFileString(file, Trait.serialize(trait))
    let scans = 0
    let reads = 0
    const watched = FileSystem.FileSystem.of({
      ...fs,
      watch: (directory, options) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* Deferred.succeed(requested, undefined)
            yield* Deferred.await(register)
            return fs.watch(directory, options)
          })
        ),
      readDirectory: (directory) => {
        if (directory === dir) scans++
        return fs.readDirectory(directory)
      },
      readFileString: (entry, encoding) => {
        if (entry === file) reads++
        return fs.readFileString(entry, encoding)
      }
    })
    const opening = yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const initial = yield* store.ls
      // Allow the trailing probe notification to pass through the debounce.
      yield* Effect.sleep("100 millis")
      const again = yield* store.ls
      expect(again).toEqual(initial)
      return initial
    }).pipe(
      Effect.provide(layerStoreLibsql(dir, true)),
      Effect.provideService(FileSystem.FileSystem, watched),
      Effect.forkChild
    )
    yield* Deferred.await(requested)
    const edited = Trait.Trait.make({ ...trait, requirement: "Changed while watcher was offline." })
    yield* fs.writeFileString(file, Trait.serialize(edited))
    yield* Deferred.succeed(register, undefined)
    const indexed = yield* Fiber.join(opening)
    expect(indexed).toEqual([edited])
    expect(scans).toBe(1)
    expect(reads).toBe(1)
  }, Effect.provide(NodeServices.layer))
)

it.live(
  "falls back without hanging when a watcher never acknowledges readiness",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-watch-silent-" })
    let closed = 0
    const watched = FileSystem.FileSystem.of({
      ...fs,
      watch: () =>
        Stream.never.pipe(
          Stream.ensuring(
            Effect.sync(() => {
              closed++
            })
          )
        )
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const rows = yield* store.ls
      expect(rows).toEqual([])
      expect(closed).toBe(1)
    }).pipe(Effect.provide(layerStoreLibsql(dir, true)), Effect.provideService(FileSystem.FileSystem, watched))
  }, Effect.provide(NodeServices.layer)),
  { timeout: 10000 }
)

it.effect(
  "offers consent-based recovery with distinct schema and malformed-document diagnostics without writing",
  Effect.fn("test.TraitStore.parseError")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-parse-" })
    const trait = Trait.Trait.make({
      name: Trait.TraitName.make("old-format"),
      subject: "Stored policies.",
      requirement: "Preserve this rule.",
      purpose: "Preserve stored intent."
    })
    const file = path.join(dir, "old-format.md")
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      for (const fixture of [
        {
          text: "---\nname: old-format\n---\nPreserve this rule.",
          tag: "SchemaError",
          diagnostic: "does not match the installed Trait schema"
        },
        {
          text: "---\nname: [\n---\nPreserve this rule.",
          tag: "InvalidYamlError",
          diagnostic: "do not assume this is a schema migration"
        }
      ]) {
        yield* fs.writeFileString(file, fixture.text)
        yield* store.refresh.pipe(Effect.result)
        for (const operation of [store.ls, store.get(trait.name), store.update(trait), store.rm([trait.name])]) {
          const result = yield* Effect.result<unknown, Effect.Error<typeof operation>, never>(operation)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({
              _tag: "TraitParseError",
              path: file,
              cause: { _tag: fixture.tag },
              message: expect.stringContaining(fixture.diagnostic)
            })
            const { message } = result.failure
            for (const instruction of [
              "Ask the developer:",
              "Do not change files before approval",
              "If declined, leave files unchanged",
              "inspect the entire affected trait store",
              "authoritative requirements, applicability, exceptions, examples",
              "ask a focused question",
              "Validate all files",
              "original arguments",
              "A server restart is not necessary",
              "original operation failed"
            ])
              expect(message).toContain(instruction)
          }
        }
        const text = yield* fs.readFileString(file)
        expect(text).toBe(fixture.text)
      }
    }).pipe(Effect.provide(layerStoreLibsql(dir)))
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "stores complete traits by unique name without overwriting duplicates",
  Effect.fn("test.TraitStore")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-names-" })
    const initial = Trait.Trait.make({
      name: Trait.TraitName.make("test-trait"),
      subject: "Asynchronous tests.",
      requirement: "Original",
      applicability: "In TypeScript and TSX, except when a synchronous framework contract must be preserved.",
      purpose: "Preserve test lifecycle behavior.",
      context: "Use the Effect-aware test APIs.\n\nSupporting context.\n\n---\nExample.\n"
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const added = yield* store.add(initial)
      expect(added).toEqual(initial)
      const loaded = yield* store.get(initial.name)
      expect(loaded).toEqual(initial)
      const updated = Trait.Trait.make({ ...initial, requirement: "Replacement", context: "Updated context.\n" })
      yield* store.update(updated)
      const reloaded = yield* store.get(initial.name)
      expect(reloaded).toEqual(updated)
      const listed = yield* store.ls
      expect(listed).toEqual([updated])
      const file = path.join(dir, `${initial.name}.md`)
      const text = yield* fs.readFileString(file)
      expect(text).toContain(`name: ${initial.name}`)
      expect(text).not.toContain("id:")
      const files = yield* fs.readDirectory(dir)
      expect(files).toEqual([`${initial.name}.md`])
      const collision = yield* store.add(initial).pipe(Effect.result)
      expect(Result.isFailure(collision)).toBe(true)
      if (Result.isFailure(collision)) {
        expect(collision.failure).toBeInstanceOf(TraitStore.TraitAlreadyExistsError)
        expect(collision.failure).toMatchObject({ name: "TraitAlreadyExistsError", traitName: initial.name })
      }
      const afterCollision = yield* store.get(initial.name)
      expect(afterCollision).toEqual(updated)
      const renamed = Trait.Trait.make({ ...updated, name: Trait.TraitName.make("renamed-trait") })
      const missingUpdate = yield* store.update(renamed).pipe(Effect.result)
      expect(Result.isFailure(missingUpdate)).toBe(true)
      if (Result.isFailure(missingUpdate)) expect(missingUpdate.failure).toBeInstanceOf(TraitStore.TraitNotFoundError)
      yield* store.add(renamed)
      yield* store.rm([initial.name])
      const afterRename = yield* store.ls
      expect(afterRename).toEqual([renamed])
      const withoutOptionalFields = Trait.Trait.make({
        name: renamed.name,
        subject: renamed.subject,
        requirement: renamed.requirement,
        purpose: renamed.purpose
      })
      yield* store.update(withoutOptionalFields)
      const cleared = yield* store.get(renamed.name)
      expect(cleared).toEqual(withoutOptionalFields)
      const missing = yield* store.get(initial.name).pipe(Effect.result)
      expect(Result.isFailure(missing)).toBe(true)
      if (Result.isFailure(missing))
        expect(missing.failure).toMatchObject({
          _tag: "TraitNotFoundError",
          name: "TraitNotFoundError",
          traitName: initial.name
        })
      yield* store.rm([renamed.name])
      const remaining = yield* store.ls
      expect(remaining).toEqual([])
    }).pipe(Effect.provide(layerStoreLibsql(dir)))
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "rejects mismatched filenames on reads, updates, removals, and listing",
  Effect.fn("test.TraitStore.nameMismatch")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-mismatch-" })
    const actual = Trait.Trait.make({
      name: Trait.TraitName.make("actual-name"),
      subject: "An artifact.",
      requirement: "Preserve its identity.",
      purpose: "Avoid identity mismatches."
    })
    const wrongName = Trait.TraitName.make("wrong-name")
    const file = path.join(dir, `${wrongName}.md`)
    yield* fs.writeFileString(file, Trait.serialize(actual))
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      for (const operation of [
        store.get(wrongName),
        store.update(Trait.Trait.make({ ...actual, name: wrongName })),
        store.rm([wrongName]),
        store.ls
      ]) {
        const result = yield* Effect.result<unknown, Effect.Error<typeof operation>, never>(operation)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result))
          expect(result.failure).toMatchObject({
            _tag: "TraitFilenameMismatchError",
            path: file,
            expectedFilename: `${actual.name}.md`
          })
      }
      const text = yield* fs.readFileString(file)
      expect(text).toBe(Trait.serialize(actual))
      yield* fs.remove(file)
      yield* store.refresh
      yield* store.add(actual)
      const loaded = yield* store.get(actual.name)
      expect(loaded).toEqual(actual)
    }).pipe(Effect.provide(layerStoreLibsql(dir)))
  }, Effect.provide(NodeServices.layer))
)
it.live(
  "automatically indexes external create/replace/delete events and repairs, and closes the watcher",
  Effect.fn("test.TraitStore.watch")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-watch-" })
    let closed = 0
    const watched = FileSystem.FileSystem.of({
      ...fs,
      watch: (directory, options) =>
        fs.watch(directory, options).pipe(
          Stream.ensuring(
            Effect.sync(() => {
              closed++
            })
          )
        )
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const db = yield* TraitDatabase.TraitDatabase
      const original = Trait.Trait.make({
        name: Trait.TraitName.make("watched-trait"),
        subject: "Watched files.",
        requirement: "Initial requirement.",
        purpose: "Synchronize automatically."
      })
      const file = path.join(dir, `${original.name}.md`)
      const temporary = path.join(dir, ".editor-temp")
      yield* fs.writeFileString(temporary, Trait.serialize(original))
      yield* fs.rename(temporary, file)
      yield* awaitTraits((traits) => traits.length === 1)
      const created = yield* store.get(original.name)
      expect(created).toEqual(original)

      const edited = Trait.Trait.make({ ...original, requirement: "Edited requirement." })
      yield* fs.writeFileString(file, Trait.serialize(edited))
      yield* awaitTraits((traits) => traits[0]?.requirement === edited.requirement)
      yield* fs.writeFileString(file, "---\nname: [\n---\n")
      const invalid = yield* store.ls.pipe(
        Effect.result,
        Effect.filterOrFail(Result.isFailure, () => "Waiting for invalidation"),
        Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 300 })
      )
      expect(invalid.failure).toBeInstanceOf(TraitStore.TraitParseError)
      const retained = yield* db.select().from(T.traits)
      expect(retained).toMatchObject([{ requirement: edited.requirement }])

      yield* fs.writeFileString(temporary, Trait.serialize(original))
      yield* fs.rename(temporary, file)
      yield* awaitTraits((traits) => traits[0]?.requirement === original.requirement)
      yield* fs.remove(file)
      yield* awaitTraits((traits) => traits.length === 0)
    }).pipe(Effect.provide(layerStoreLibsql(dir, true)), Effect.provideService(FileSystem.FileSystem, watched))
    expect(closed).toBe(1)
  }, Effect.provide(NodeServices.layer))
)

it.live(
  "falls back to polling after watch failure and retries the directory watch",
  Effect.fn("test.TraitStore.watchRetry")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-watch-retry-" })
    let attempts = 0
    const watched = FileSystem.FileSystem.of({
      ...fs,
      watch: (directory, options) => {
        attempts++
        return attempts === 1
          ? Stream.fail(
              PlatformError.systemError({
                _tag: "Unknown",
                module: "FileSystem",
                method: "watch",
                pathOrDescriptor: directory,
                cause: "Injected watch failure"
              })
            )
          : fs.watch(directory, options)
      }
    })
    yield* Effect.gen(function* () {
      const trait = Trait.Trait.make({
        name: Trait.TraitName.make("watch-recovery"),
        subject: "Watcher recovery.",
        requirement: "Recover automatically.",
        purpose: "Avoid stale reads after watch failure."
      })
      yield* fs.writeFileString(path.join(dir, `${trait.name}.md`), Trait.serialize(trait))
      yield* awaitTraits((traits) => traits[0]?.name === trait.name)
      yield* Effect.sync(() => attempts).pipe(
        Effect.filterOrFail(
          (count) => count >= 2,
          () => "Waiting for watch restart"
        ),
        Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 300 })
      )
      expect(attempts).toBeGreaterThanOrEqual(2)
    }).pipe(Effect.provide(layerStoreLibsql(dir, true)), Effect.provideService(FileSystem.FileSystem, watched))
  }, Effect.provide(NodeServices.layer))
)

it.live(
  "polls external changes and repairs when watching is unsupported",
  Effect.fn("test.TraitStore.polling")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-poll-" })
    const unsupported = FileSystem.FileSystem.of({
      ...fs,
      watch: () => Stream.die(new Error("Watch backend unsupported"))
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const trait = Trait.Trait.make({
        name: Trait.TraitName.make("polled"),
        subject: "External files.",
        requirement: "Poll without a watcher.",
        purpose: "Support unavailable watch backends."
      })
      const file = path.join(dir, `${trait.name}.md`)
      yield* fs.writeFileString(file, Trait.serialize(trait))
      yield* awaitTraits((traits) => traits[0]?.name === trait.name)
      yield* fs.writeFileString(file, "---\nname: [\n---\n")
      const invalid = yield* store.ls.pipe(
        Effect.result,
        Effect.filterOrFail(Result.isFailure, () => "Waiting for polling invalidation"),
        Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 300 })
      )
      expect(invalid.failure).toBeInstanceOf(TraitStore.TraitParseError)
      yield* fs.writeFileString(file, Trait.serialize(trait))
      yield* awaitTraits((traits) => traits[0]?.name === trait.name)
      yield* fs.remove(file)
      yield* awaitTraits((traits) => traits.length === 0)
    }).pipe(Effect.provide(layerStoreLibsql(dir, true)), Effect.provideService(FileSystem.FileSystem, unsupported))
  }, Effect.provide(NodeServices.layer))
)

it.live(
  "bounds concurrent file reads during hydration, refresh and incremental reconciliation",
  Effect.fn("test.TraitStore.fileReadConcurrency")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    for (const concurrency of [1, 3]) {
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-read-limit-" })
      const events = yield* Queue.unbounded<FileSystem.WatchEvent>()
      const documents = Array.map(Array.range(0, 11), (index) =>
        Trait.Trait.make({
          name: Trait.TraitName.make(`bounded-${index}`),
          subject: "File reads.",
          requirement: "Bound in-flight reads.",
          purpose: "Protect resources."
        })
      )
      yield* Effect.forEach(
        documents,
        (trait) => fs.writeFileString(path.join(dir, `${trait.name}.md`), Trait.serialize(trait)),
        { discard: true }
      )
      let active = 0
      let peak = 0
      let delivered = 0
      const observed = FileSystem.FileSystem.of({
        ...fs,
        watch: () =>
          Stream.fromQueue(events).pipe(
            Stream.tap(() =>
              Effect.sync(() => {
                delivered++
              })
            ),
            (stream) => Stream.concat(watchReady, stream)
          ),
        readFileString: (file, encoding) =>
          path.dirname(file) !== dir
            ? fs.readFileString(file, encoding)
            : Effect.acquireUseRelease(
                Effect.sync(() => {
                  active++
                  peak = Math.max(peak, active)
                }),
                () => fs.readFileString(file, encoding).pipe(Effect.delay("5 millis")),
                () =>
                  Effect.sync(() => {
                    active--
                  })
              )
      })
      yield* Effect.gen(function* () {
        const store = yield* TraitStore.TraitStore
        expect(peak).toBe(concurrency)
        expect(active).toBe(0)
        peak = 0
        yield* store.refresh
        expect(peak).toBe(concurrency)
        expect(active).toBe(0)
        peak = 0
        yield* Queue.offerAll(
          events,
          Array.map(documents, (trait): FileSystem.WatchEvent => ({
            _tag: "Update",
            path: path.join(dir, `${trait.name}.md`)
          }))
        )
        yield* Effect.sync(() => delivered).pipe(
          Effect.filterOrFail(
            (count) => count === documents.length,
            () => "Waiting for file events"
          ),
          Effect.retry({ schedule: Schedule.spaced("1 millis"), times: 1000 })
        )
        yield* Effect.yieldNow
        const traits = yield* store.ls
        expect(traits).toHaveLength(documents.length)
        expect(peak).toBe(concurrency)
        expect(active).toBe(0)
      }).pipe(
        Effect.provide(layerStoreLibsql(dir, true, concurrency)),
        Effect.provideService(FileSystem.FileSystem, observed)
      )
    }
  }, Effect.provide(NodeServices.layer))
)

it.live(
  "reconciles only notified files, skips self-write SQL, and retains events arriving during reconciliation",
  Effect.fn("test.TraitStore.incremental")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-incremental-" })
    const events = yield* Queue.unbounded<FileSystem.WatchEvent>()
    const original = Trait.Trait.make({
      name: Trait.TraitName.make("incremental"),
      subject: "Changes.",
      requirement: "Original.",
      purpose: "Bound reconciliation work."
    })
    const other = Trait.Trait.make({ ...original, name: Trait.TraitName.make("untouched") })
    const file = path.join(dir, `${original.name}.md`)
    const otherFile = path.join(dir, `${other.name}.md`)
    yield* fs.writeFileString(file, Trait.serialize(original))
    yield* fs.writeFileString(otherFile, Trait.serialize(other))
    let scans = 0
    let otherReads = 0
    let captured: Deferred.Deferred<void> | undefined
    let resume: Deferred.Deferred<void> | undefined
    let delivered = 0
    const watched = FileSystem.FileSystem.of({
      ...fs,
      watch: () =>
        Stream.fromQueue(events).pipe(
          Stream.tap(() =>
            Effect.sync(() => {
              delivered++
            })
          ),
          (stream) => Stream.concat(watchReady, stream)
        ),
      readDirectory: (directory) => {
        if (directory === dir) scans++
        return fs.readDirectory(directory)
      },
      readFileString: Effect.fnUntraced(function* (entry, encoding) {
        if (entry === otherFile) otherReads++
        const text = yield* fs.readFileString(entry, encoding)
        if (entry === file && captured !== undefined && resume !== undefined) {
          const latch = captured
          const release = resume
          captured = undefined
          yield* Deferred.succeed(latch, undefined)
          yield* Deferred.await(release)
        }
        return text
      })
    })
    const notify = Effect.fnUntraced(function* (entry: string) {
      const count = delivered
      yield* Queue.offer(events, { _tag: "Update", path: entry })
      yield* Effect.sync(() => delivered).pipe(
        Effect.filterOrFail(
          (value) => value > count,
          () => "Waiting for event delivery"
        ),
        Effect.retry({ schedule: Schedule.spaced("1 millis"), times: 1000 })
      )
      yield* Effect.yieldNow
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const db = yield* TraitDatabase.TraitDatabase
      expect(scans).toBe(1)
      expect(otherReads).toBe(1)
      const updated = Trait.Trait.make({ ...original, requirement: "Own write." })
      yield* store.update(updated)
      yield* db.run(
        sql`CREATE TRIGGER reject_redundant_update BEFORE UPDATE ON traits BEGIN SELECT RAISE(ABORT, 'redundant SQL'); END`
      )
      yield* notify(file)
      const same = yield* store.get(original.name)
      expect(same).toEqual(updated)
      yield* db.run(sql`DROP TRIGGER reject_redundant_update`)

      const firstEdit = Trait.Trait.make({ ...original, requirement: "First external edit." })
      const secondEdit = Trait.Trait.make({ ...original, requirement: "Second external edit." })
      captured = yield* Deferred.make<void>()
      const observed = captured
      resume = yield* Deferred.make<void>()
      yield* fs.writeFileString(file, Trait.serialize(firstEdit))
      yield* notify(file)
      const reading = yield* store.get(original.name).pipe(Effect.forkChild)
      yield* Deferred.await(observed)
      yield* fs.writeFileString(file, Trait.serialize(secondEdit))
      yield* notify(file)
      yield* Deferred.succeed(resume, undefined)
      const latest = yield* Fiber.join(reading)
      expect(latest).toEqual(secondEdit)

      // One invalid file blocks the whole pending batch, preserving all previously indexed rows.
      yield* fs.writeFileString(file, Trait.serialize(original))
      yield* fs.writeFileString(otherFile, "---\nname: [\n---\n")
      yield* Queue.offerAll(events, [
        { _tag: "Update", path: file },
        { _tag: "Update", path: otherFile }
      ])
      yield* notify(otherFile)
      const invalid = yield* store.ls.pipe(Effect.result)
      expect(Result.isFailure(invalid)).toBe(true)
      const rows = yield* db.select().from(T.traits)
      expect(rows).toContainEqual(expect.objectContaining({ name: original.name, requirement: secondEdit.requirement }))
      yield* fs.writeFileString(otherFile, Trait.serialize(other))
      yield* notify(otherFile)
      const repaired = yield* store.ls
      expect(repaired).toEqual([original, other])
      expect(scans).toBe(1)
      yield* db.run(
        sql`CREATE TRIGGER reject_incremental_update BEFORE UPDATE ON traits WHEN OLD.name = 'untouched' BEGIN SELECT RAISE(ABORT, 'injected batch failure'); END`
      )
      yield* fs.writeFileString(file, Trait.serialize(secondEdit))
      yield* fs.writeFileString(
        otherFile,
        Trait.serialize(Trait.Trait.make({ ...other, requirement: "Updated batch." }))
      )
      yield* Queue.offerAll(events, [
        { _tag: "Update", path: file },
        { _tag: "Update", path: otherFile }
      ])
      yield* notify(otherFile)
      const failedBatch = yield* store.ls.pipe(Effect.result)
      expect(Result.isFailure(failedBatch)).toBe(true)
      const rolledBack = yield* db.select().from(T.traits)
      expect(rolledBack).toContainEqual(
        expect.objectContaining({ name: original.name, requirement: original.requirement })
      )
      yield* db.run(sql`DROP TRIGGER reject_incremental_update`)
      const recoveredBatch = yield* store.ls
      expect(recoveredBatch[0]?.requirement).toBe(secondEdit.requirement)
      expect(recoveredBatch[1]?.requirement).toBe("Updated batch.")
      expect(scans).toBe(1)
      // A notification without a usable filename deliberately requests a full rescan.
      yield* notify(dir)
      yield* store.ls
      expect(scans).toBe(2)
    }).pipe(Effect.provide(layerStoreLibsql(dir, true)), Effect.provideService(FileSystem.FileSystem, watched))
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "hydrates on startup, serves SQLite-only reads, and rebuilds transactionally when invalidated",
  Effect.fn("test.TraitStore.index")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-index-test-" })
    const original = Trait.Trait.make({
      name: Trait.TraitName.make("indexed-trait"),
      subject: "Stored traits.",
      requirement: "Original requirement.",
      purpose: "Keep indexed content current."
    })
    const file = path.join(dir, `${original.name}.md`)
    yield* fs.writeFileString(file, Trait.serialize(original))
    yield* fs.utimes(file, 1000, 1000)
    let reads = 0
    const counted = FileSystem.FileSystem.of({
      ...fs,
      readFileString: (file, encoding) => {
        if (path.dirname(file) === dir) reads++
        return fs.readFileString(file, encoding)
      }
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const db = yield* TraitDatabase.TraitDatabase
      const startup = yield* db.select().from(T.traits)
      expect(startup).toMatchObject([{ name: original.name, requirement: original.requirement }])
      const initial = yield* store.ls
      expect(initial).toEqual([original])
      const loaded = yield* store.get(original.name)
      expect(loaded).toEqual(original)
      const unchanged = yield* store.ls
      expect(unchanged).toEqual([original])
      expect(reads).toBe(1)

      const edited = Trait.Trait.make({ ...original, requirement: "Modified requirement." })
      yield* fs.writeFileString(file, Trait.serialize(edited))
      yield* fs.utimes(file, 1000, 1000)
      const beforeRefresh = yield* store.get(original.name)
      expect(beforeRefresh).toEqual(original)
      expect(reads).toBe(1)
      yield* store.refresh
      const refreshed = yield* store.get(original.name)
      expect(refreshed).toEqual(edited)
      expect(reads).toBe(2)

      yield* fs.writeFileString(file, "---\nname: [\n---\n")
      const invalid = yield* store.refresh.pipe(Effect.result)
      expect(Result.isFailure(invalid)).toBe(true)
      if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(TraitStore.TraitParseError)
      const unchangedRows = yield* db.select().from(T.traits)
      expect(unchangedRows).toMatchObject([{ requirement: edited.requirement }])
      const blocked = yield* store.ls.pipe(Effect.result)
      expect(Result.isFailure(blocked)).toBe(true)
      yield* fs.writeFileString(file, Trait.serialize(edited))
      yield* store.refresh
      const repaired = yield* store.ls
      expect(repaired).toEqual([edited])

      yield* fs.remove(file)
      yield* store.refresh
      const deleted = yield* store.ls
      expect(deleted).toEqual([])
      const missing = yield* store.get(original.name).pipe(Effect.result)
      expect(Result.isFailure(missing)).toBe(true)
      if (Result.isFailure(missing)) expect(missing.failure).toBeInstanceOf(TraitStore.TraitNotFoundError)
    }).pipe(Effect.provide(layerStoreLibsql(dir)), Effect.provideService(FileSystem.FileSystem, counted))
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "writes through before returning, serializes mutations, and recovers from a failed database write",
  Effect.fn("test.TraitStore.writeThrough")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-write-through-" })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const db = yield* TraitDatabase.TraitDatabase
      const original = Trait.Trait.make({
        name: Trait.TraitName.make("write-through"),
        subject: "Stored traits.",
        requirement: "Original requirement.",
        purpose: "Keep both representations synchronized.",
        context: "Original body.\n"
      })
      const additions = yield* Effect.all(
        [store.add(original).pipe(Effect.result), store.add(original).pipe(Effect.result)],
        { concurrency: "unbounded" }
      )
      expect(Array.filter(additions, Result.isSuccess)).toHaveLength(1)
      const inserted = yield* db.select().from(T.traits)
      expect(inserted).toMatchObject([{ name: original.name, context: original.context }])

      const updated = Trait.Trait.make({ ...original, requirement: "Updated requirement.", context: undefined })
      yield* store.update(updated)
      const replaced = yield* db.select().from(T.traits)
      expect(replaced).toMatchObject([{ requirement: updated.requirement, context: null }])

      yield* db.run(
        sql`CREATE TRIGGER reject_trait_update BEFORE UPDATE ON traits BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`
      )
      const failed = yield* store.update(original).pipe(Effect.result)
      expect(Result.isFailure(failed)).toBe(true)
      const afterFailure = yield* db.select().from(T.traits)
      expect(afterFailure).toMatchObject([{ requirement: updated.requirement }])
      const autoRecovered = yield* store.get(original.name)
      expect(autoRecovered).toEqual(original)
      const markdown = yield* fs.readFileString(path.join(dir, `${original.name}.md`))
      expect(markdown).toBe(Trait.serialize(original))
      yield* db.run(sql`DROP TRIGGER reject_trait_update`)
      const recovered = yield* store.get(original.name)
      expect(recovered).toEqual(original)
      yield* store.rm([original.name])
      const removed = yield* db.select().from(T.traits)
      expect(removed).toEqual([])
      const files = yield* fs.readDirectory(dir)
      expect(files).toEqual([])
    }).pipe(Effect.provide(layerStoreLibsql(dir)))
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "automatically retries failed insert/delete synchronization without serving stale rows",
  Effect.fn("test.TraitStore.failedWrites")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    for (const operation of ["INSERT", "DELETE"] as const) {
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-failed-write-" })
      yield* Effect.gen(function* () {
        const store = yield* TraitStore.TraitStore
        const db = yield* TraitDatabase.TraitDatabase
        const trait = Trait.Trait.make({
          name: Trait.TraitName.make("failed-write"),
          subject: "Trait persistence.",
          requirement: "Keep successful reads synchronized.",
          purpose: "Require explicit recovery from failed writes."
        })
        if (operation === "DELETE") yield* store.add(trait)
        const before = yield* db.select().from(T.traits)
        yield* db.run(
          sql.raw(
            `CREATE TRIGGER reject_write BEFORE ${operation} ON traits BEGIN SELECT RAISE(ABORT, 'injected failure'); END`
          )
        )
        const write = operation === "INSERT" ? store.add(trait) : store.rm([trait.name])
        const failed = yield* Effect.result<unknown, Effect.Error<typeof write>, never>(write)
        expect(Result.isFailure(failed)).toBe(true)
        const blocked = yield* store.ls.pipe(Effect.result)
        expect(Result.isFailure(blocked)).toBe(true)
        const retained = yield* db.select().from(T.traits)
        expect(retained).toEqual(before)
        yield* db.run(sql`DROP TRIGGER reject_write`)
        const recovered = yield* store.ls
        expect(recovered).toEqual(operation === "INSERT" ? [trait] : [])
        const exists = yield* fs.exists(path.join(dir, `${trait.name}.md`))
        expect(exists).toBe(operation === "INSERT")
      }).pipe(Effect.provide(layerStoreLibsql(dir)))
    }
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "finishes database synchronization when interrupted after publishing a file",
  Effect.fn("test.TraitStore.interruption")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-interrupt-" })
    const published = yield* Deferred.make<void>()
    const resume = yield* Deferred.make<void>()
    const original = Trait.Trait.make({
      name: Trait.TraitName.make("interrupted-write"),
      subject: "Trait mutations.",
      requirement: "Original.",
      purpose: "Finish write-through before cancellation."
    })
    yield* fs.writeFileString(path.join(dir, `${original.name}.md`), Trait.serialize(original))
    const controlled = FileSystem.FileSystem.of({
      ...fs,
      rename: Effect.fn("test.publish")(function* (from, to) {
        yield* fs.rename(from, to)
        yield* Deferred.succeed(published, undefined)
        yield* Deferred.await(resume)
      })
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const db = yield* TraitDatabase.TraitDatabase
      const updated = Trait.Trait.make({ ...original, requirement: "Replacement." })
      const writer = yield* store.update(updated).pipe(Effect.forkScoped)
      yield* Deferred.await(published)
      const interruption = yield* Fiber.interrupt(writer).pipe(Effect.forkScoped)
      yield* Deferred.succeed(resume, undefined)
      yield* Fiber.join(interruption)
      const rows = yield* db.select().from(T.traits)
      expect(rows).toMatchObject([{ name: original.name, requirement: updated.requirement }])
      const content = yield* fs.readFileString(path.join(dir, `${original.name}.md`))
      expect(content).toBe(Trait.serialize(updated))
      const files = yield* fs.readDirectory(dir)
      expect(files).toEqual([`${original.name}.md`])
    }).pipe(Effect.provide(layerStoreLibsql(dir)), Effect.provideService(FileSystem.FileSystem, controlled))
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "preserves the previous Markdown and removes temporary files when staging a write fails",
  Effect.fn("test.TraitStore.atomicFailure")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "traits-atomic-" })
    const original = Trait.Trait.make({
      name: Trait.TraitName.make("atomic-write"),
      subject: "Trait files.",
      requirement: "Preserve complete content.",
      purpose: "Avoid damaging the previous file on write failure."
    })
    const file = path.join(dir, `${original.name}.md`)
    yield* fs.writeFileString(file, Trait.serialize(original))
    const failing = FileSystem.FileSystem.of({
      ...fs,
      writeFileString: Effect.fn("test.failStaging")(function* (target) {
        yield* fs.writeFileString(target, "partial staging content")
        yield* fs.readFileString(path.join(dir, "missing-file"))
      })
    })
    yield* Effect.gen(function* () {
      const store = yield* TraitStore.TraitStore
      const result = yield* store
        .update(Trait.Trait.make({ ...original, requirement: "Replacement." }))
        .pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      const content = yield* fs.readFileString(file)
      expect(content).toBe(Trait.serialize(original))
      const recovered = yield* store.get(original.name)
      expect(recovered).toEqual(original)
      const files = yield* fs.readDirectory(dir)
      expect(files).toEqual([`${original.name}.md`])
    }).pipe(Effect.provide(layerStoreLibsql(dir)), Effect.provideService(FileSystem.FileSystem, failing))
  }, Effect.provide(NodeServices.layer))
)
