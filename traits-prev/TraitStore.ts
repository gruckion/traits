import { eq, inArray } from "drizzle-orm"
import {
  Array,
  Cause,
  Context,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  flow,
  Layer,
  Path,
  pipe,
  PlatformError,
  Predicate,
  Schedule,
  Schema as S,
  Semaphore,
  Stream,
  String
} from "effect"

import { ProjectPaths } from "./ProjectPaths.ts"
import { T } from "./tables/index.ts"
import * as Trait from "./Trait.ts"
import * as TraitDatabase from "./TraitDatabase.ts"
import { TraitsContext } from "./TraitsContext.ts"

export class TraitParseError extends S.TaggedError<TraitParseError>()("TraitParseError", {
  path: S.String,
  cause: S.Defect()
}) {
  override get message() {
    const diagnosis = S.isSchemaError(this.cause)
      ? "The document does not match the installed Trait schema. This may be a legacy format or invalid field values; inspect it before deciding migration is appropriate."
      : "The document could not be parsed. Inspect the original diagnostic for malformed YAML or missing/unterminated frontmatter; do not assume this is a schema migration."
    return String.stripMargin(`
    | Unable to parse trait ${this.path}.
    | ${Cause.pretty(Cause.fail(this.cause))}
    |
    | ${diagnosis}
    | Recovery requires developer consent. Ask the developer: "May I automatically resolve the stored-trait parse errors and retry the blocked operation?"
    | Do not change files before approval. Do not merely report the blocker and stop without offering this recovery choice. If declined, leave files unchanged and report the operation as incomplete.
    | After approval, inspect the entire affected trait store, not just the first failing file. Classify each failure and migrate repairable legacy formats to the installed Trait schema; repair malformed documents only where the intended content is clear.
    | Preserve names, authoritative requirements, applicability, exceptions, examples, and all other supporting context. If a repair is ambiguous or unsupported, ask a focused question rather than guessing, inventing intent, or dropping information. Leave already-valid traits unchanged.
    | The current format requires name, subject, requirement, and purpose in YAML frontmatter; applicability is optional text, and the Markdown body is optional context. Advisory guidance belongs in context; move legacy guidance there only after migration approval. Purpose explains intended benefit, not additional obligations. Legacy body requirements belong in requirement; when/mime/skip become applicability prose; diffs and additional information belong in context.
    | Validate all files in the affected store with the installed Trait schema and serialize format, then retry the originally blocked operation with its original arguments. Synchronization after repairs is automatic. A server restart is not necessary.
    | No automatic migration has occurred. The original operation failed; do not treat it as successful or claim a completed check until the retry succeeds.
    `)
  }
}

export class TraitNotFoundError extends S.TaggedError<TraitNotFoundError>()("TraitNotFoundError", {
  traitName: Trait.TraitName
}) {
  override get message() {
    return `Trait ${this.traitName} was not found`
  }
}

export class TraitAlreadyExistsError extends S.TaggedError<TraitAlreadyExistsError>()("TraitAlreadyExistsError", {
  traitName: Trait.TraitName
}) {
  override get message() {
    return `Trait ${this.traitName} already exists`
  }
}

export class TraitFilenameMismatchError extends S.TaggedError<TraitFilenameMismatchError>()(
  "TraitFilenameMismatchError",
  { path: S.String, expectedFilename: S.String }
) {
  override get message() {
    return `Trait filename must be ${this.expectedFilename}, received ${this.path}`
  }
}

export const TraitStoreError = S.Union([
  S.Struct({ ...TraitNotFoundError.fields, message: S.String }),
  S.Struct({ ...TraitAlreadyExistsError.fields, message: S.String }),
  S.Struct({ ...TraitFilenameMismatchError.fields, message: S.String }),
  S.Struct({ ...TraitParseError.fields, message: S.String }),
  S.TaggedStruct("PlatformError", { message: S.String }),
  S.TaggedStruct("SqlError", { message: S.String }),
  S.TaggedStruct("EffectDrizzleQueryError", { message: S.String })
])

const watchProbePrefix = ".traits-watch-"

/** Markdown is authoritative; watch notifications reconcile only affected files. */
const make = Effect.gen(function* () {
  const db = yield* TraitDatabase.TraitDatabase
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { traitsDirectory } = yield* ProjectPaths
  const { asFileRead } = yield* TraitsContext
  yield* fs.makeDirectory(traitsDirectory, { recursive: true })
  const traitPath = (name: Trait.TraitName) => path.join(traitsDirectory, `${name}.md`)
  const readFile = Effect.fn("TraitStore.readFile")(function* (file: string) {
    const text = yield* fs.readFileString(file)
    return yield* Trait.parse(text, file).pipe(
      Effect.mapError((cause) => TraitParseError.make({ path: file, cause })),
      Effect.filterOrFail(
        (trait) => `${trait.name}.md` === path.basename(file),
        (trait) => TraitFilenameMismatchError.make({ path: file, expectedFilename: `${trait.name}.md` })
      )
    )
  })
  const readMarkdown = Effect.fn("TraitStore.readMarkdown")((name: Trait.TraitName) =>
    pipe(
      name,
      traitPath,
      readFile,
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound" ? TraitNotFoundError.make({ traitName: name }) : error
      })
    )
  )
  const semaphore = yield* Semaphore.make(1)
  const serialize = semaphore.withPermits(1)
  const table = T.traits
  const equivalent = S.toEquivalence(Trait.Trait)
  // Generations ensure events arriving during a scan or SQL transaction are not acknowledged early.
  let revision = 0
  let fullRevision = 0
  let indexedRevision = -1
  const dirty = new Map<string, number>()
  let watcherFailure: PlatformError.PlatformError | undefined
  const invalidate = Effect.sync(() => {
    fullRevision = ++revision
  })
  const values = (trait: Trait.Trait) => ({
    ...trait,
    applicability: trait.applicability ?? null,
    context: trait.context ?? null
  })
  const fromRow = (row: T.traits["$inferSelect"]) =>
    Trait.Trait.make({
      name: Trait.TraitName.make(row.name),
      subject: row.subject,
      requirement: row.requirement,
      ...(row.applicability === null ? {} : { applicability: row.applicability }),
      purpose: row.purpose,
      ...(row.context === null ? {} : { context: row.context })
    })
  const acknowledge = (snapshot: ReadonlyMap<string, number>) => {
    for (const [file, generation] of snapshot) if (dirty.get(file) === generation) dirty.delete(file)
  }
  const rebuild = Effect.gen(function* () {
    const currentRevision = fullRevision
    const snapshot = new Map(dirty)
    const documents = yield* fs.readDirectory(traitsDirectory).pipe(
      Effect.flatMap(
        flow(
          Array.sort(String.Order),
          Array.filter(String.endsWith(".md")),
          Effect.forEach(
            Effect.fn("TraitStore.readEntry")(function* (name) {
              const file = path.join(traitsDirectory, name)
              const info = yield* fs.stat(file)
              if (info.type !== "File") return undefined
              return yield* readFile(file)
            }, asFileRead),
            { concurrency: "unbounded" }
          )
        )
      ),
      Effect.map(Array.filter(Predicate.isNotUndefined)),
      Effect.withSpan("TraitStore.scanMarkdown")
    )
    yield* Effect.gen(function* () {
      yield* db.delete(table)
      yield* Effect.forEach(
        Array.chunksOf(documents, 100),
        (batch) => db.insert(table).values(Array.map(batch, values)),
        { discard: true }
      )
    }).pipe(db.$client.withTransaction)
    indexedRevision = currentRevision
    acknowledge(snapshot)
  }).pipe(Effect.withSpan("TraitStore.rebuild"))
  const reconcile = Effect.gen(function* () {
    const snapshot = new Map(dirty)
    // Validate the entire pending batch before touching SQLite. Failed batches remain dirty.
    const documents = yield* Effect.forEach(
      snapshot.keys(),
      Effect.fnUntraced(function* (file) {
        const document = yield* Effect.gen(function* () {
          const info = yield* fs.stat(file)
          return info.type === "File" ? yield* readFile(file) : undefined
        }).pipe(
          Effect.catchTags({
            PlatformError: (error) => (error.reason._tag === "NotFound" ? Effect.undefined : error)
          })
        )
        return { name: path.basename(file, ".md"), document }
      }, asFileRead),
      { concurrency: "unbounded" }
    )
    yield* Effect.gen(function* () {
      const removed: Array<string> = []
      yield* Effect.forEach(
        documents,
        Effect.fnUntraced(function* (entry) {
          const rows = yield* db.select().from(table).where(eq(table.name, entry.name))
          const row = rows[0]
          if (entry.document === undefined) {
            if (row !== undefined) removed.push(entry.name)
          } else if (row === undefined) {
            yield* db.insert(table).values(values(entry.document))
          } else if (!equivalent(fromRow(row), entry.document)) {
            yield* db.update(table).set(values(entry.document)).where(eq(table.name, entry.name))
          }
        }),
        { discard: true }
      )
      yield* Effect.forEach(
        Array.chunksOf(removed, 100),
        (names) => db.delete(table).where(inArray(table.name, names)),
        { discard: true }
      )
    }).pipe(db.$client.withTransaction)
    acknowledge(snapshot)
  }).pipe(Effect.withSpan("TraitStore.reconcile"))
  const ready = Effect.gen(function* () {
    while (true) {
      if (indexedRevision !== fullRevision) yield* rebuild
      else if (dirty.size > 0) yield* reconcile
      else return
    }
  })
  const refresh = invalidate.pipe(
    Effect.andThen(ready),
    Effect.asVoid,
    Effect.uninterruptible,
    serialize,
    Effect.withSpan("TraitStore.refresh")
  )
  const synchronize = ready.pipe(
    serialize,
    Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.logWarning(cause)))
  )
  const get = Effect.fn("TraitStore.getIndexed")(function* (name: Trait.TraitName) {
    yield* ready
    const rows = yield* db.select().from(table).where(eq(table.name, name))
    const row = rows[0]
    return row === undefined ? yield* TraitNotFoundError.make({ traitName: name }) : fromRow(row)
  })
  const store = {
    refresh,
    get: flow(get, serialize),
    ls: Effect.gen(function* () {
      yield* ready
      return yield* db
        .select()
        .from(table)
        .orderBy(table.name)
        .pipe(Effect.map(Array.map(fromRow)))
    }).pipe(serialize, Effect.withSpan("TraitStore.lsIndexed")),
    add: Effect.fn("TraitStore.addIndexed")(
      function* (trait: Trait.Trait) {
        yield* ready
        yield* db
          .select({ name: table.name })
          .from(table)
          .where(eq(table.name, trait.name))
          .pipe(
            Effect.filterOrFail(
              (existing) => existing.length === 0,
              () => TraitAlreadyExistsError.make({ traitName: trait.name })
            )
          )
        yield* Effect.gen(function* () {
          const directory = yield* fs.makeTempDirectoryScoped({
            directory: traitsDirectory,
            prefix: ".traits-write-"
          })
          const temporary = path.join(directory, `${trait.name}.md`)
          yield* fs.writeFileString(temporary, Trait.serialize(trait))
          yield* fs.link(temporary, traitPath(trait.name)).pipe(
            Effect.catchTags({
              PlatformError: (error) =>
                error.reason._tag === "AlreadyExists" ? TraitAlreadyExistsError.make({ traitName: trait.name }) : error
            })
          )
        }).pipe(
          Effect.scoped,
          Effect.withSpan("TraitStore.addMarkdown"),
          Effect.tapCause(() => invalidate)
        )
        yield* db
          .insert(table)
          .values(values(trait))
          .pipe(Effect.tapCause(() => invalidate))
        return trait
      },
      Effect.uninterruptible,
      serialize
    ),
    update: Effect.fn("TraitStore.updateIndexed")(
      function* (trait: Trait.Trait) {
        yield* get(trait.name)
        yield* Effect.gen(function* () {
          yield* readMarkdown(trait.name)
          const info = yield* fs.stat(traitPath(trait.name))
          const directory = yield* fs.makeTempDirectoryScoped({
            directory: traitsDirectory,
            prefix: ".traits-write-"
          })
          const temporary = path.join(directory, `${trait.name}.md`)
          yield* fs.writeFileString(temporary, Trait.serialize(trait), { mode: info.mode })
          yield* fs.rename(temporary, traitPath(trait.name))
        }).pipe(
          Effect.scoped,
          Effect.withSpan("TraitStore.updateMarkdown"),
          Effect.tapCause(() => invalidate)
        )
        yield* db
          .update(table)
          .set(values(trait))
          .where(eq(table.name, trait.name))
          .pipe(Effect.tapCause(() => invalidate))
      },
      Effect.uninterruptible,
      serialize
    ),
    rm: Effect.fn("TraitStore.rmIndexed")(
      function* (names: ReadonlyArray<Trait.TraitName>) {
        yield* ready
        yield* Effect.forEach(names, get, { discard: true })
        yield* Effect.forEach(
          names,
          flow(
            readMarkdown,
            Effect.flatMap((trait) => fs.remove(traitPath(trait.name)))
          ),
          { discard: true }
        ).pipe(Effect.tapCause(() => invalidate))
        yield* db
          .delete(table)
          .where(inArray(table.name, names))
          .pipe(Effect.tapCause(() => invalidate))
      },
      Effect.uninterruptible,
      serialize
    )
  }
  const started = yield* Deferred.make<void>()
  yield* Effect.gen(function* () {
    yield* fs.makeDirectory(traitsDirectory, { recursive: true })
    let live = false
    const watcher = yield* fs.watch(traitsDirectory).pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          watcherFailure = undefined
          const file = path.resolve(traitsDirectory, event.path)
          // Any notification proves the watcher is live. Rescan changes made while it was offline.
          if (!live) {
            fullRevision = ++revision
            live = true
          }
          // Missing/ambiguous filenames require a full rescan, not a guessed incremental update.
          if (pipe(path.basename(file), String.startsWith(watchProbePrefix))) return
          if (file === traitsDirectory) fullRevision = ++revision
          else if (path.dirname(file) === traitsDirectory && path.extname(file) === ".md") dirty.set(file, ++revision)
        })
      ),
      Stream.debounce("50 millis"),
      Stream.runForEach(() => synchronize),
      Effect.forkScoped
    )
    const watchEnded = Fiber.join(watcher).pipe(
      Effect.andThen(
        PlatformError.systemError({
          _tag: "Unknown",
          module: "FileSystem",
          method: "watch",
          pathOrDescriptor: traitsDirectory,
          cause: "The trait directory watch ended unexpectedly."
        })
      )
    )
    // Establish watch readiness before hydrating, so the probe cannot trigger a second full scan.
    yield* fs.makeTempDirectoryScoped({ directory: traitsDirectory, prefix: watchProbePrefix }).pipe(
      Effect.asVoid,
      Effect.scoped,
      Effect.ignore,
      Effect.repeat({ schedule: Schedule.spaced("25 millis"), times: 80, until: () => live }),
      Effect.filterOrFail(
        () => live,
        () =>
          PlatformError.systemError({
            _tag: "TimedOut",
            module: "FileSystem",
            method: "watch",
            pathOrDescriptor: traitsDirectory,
            description: "Directory watcher did not become ready"
          })
      ),
      Effect.raceFirst(watchEnded)
    )
    yield* synchronize.pipe(Effect.raceFirst(watchEnded))
    yield* Deferred.succeed(started, undefined)
    return yield* watchEnded
  }).pipe(
    Effect.scoped,
    // Backend registration may throw or die instead of returning a tagged platform error.
    // Recover here so unsupported watch implementations can still use the polling path.
    Effect.catchDefect((cause) =>
      PlatformError.systemError({
        _tag: "Unknown",
        module: "FileSystem",
        method: "watch",
        pathOrDescriptor: traitsDirectory,
        cause
      })
    ),
    Effect.tapError((error) =>
      Effect.gen(function* () {
        const firstFailure = watcherFailure === undefined
        watcherFailure = error
        yield* invalidate
        if (firstFailure)
          yield* Effect.logWarning("Trait watch unavailable; polling Markdown while retrying the watcher.", error)
        yield* synchronize
        yield* Deferred.succeed(started, undefined)
      })
    ),
    Effect.retry(Schedule.spaced("1 second")),
    Effect.forkScoped
  )
  yield* Deferred.await(started)
  return store
}).pipe(Effect.withSpan("TraitStore.open"))

export class TraitStore extends Context.Service<TraitStore, Effect.Success<typeof make>>()("traits-prev/TraitStore") {}

export const layer = make.pipe(Layer.effect(TraitStore))
