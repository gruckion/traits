import os from "node:os"
import { fileURLToPath } from "node:url"

import {
  Array,
  Config,
  Console,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  pipe,
  Record,
  Schema as S,
  String
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import * as Trait from "traits-prev/Trait"

import * as Model from "./model.ts"
import * as Stats from "./stats.ts"

interface Run extends Model.WorkerResult {
  readonly fixture: string | number
}

export const compare = Effect.fn("benchmarks.compare")(function* (options: Model.CompareOptions) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
  const execute = (command: string, args: ReadonlyArray<string>) =>
    spawner.string(ChildProcess.make(command, args, { cwd: root }))
  const git = (...args: Array<string>) => execute("git", args).pipe(Effect.map(String.trim))
  const baseSha = yield* git("rev-parse", options.base)
  const headSha = yield* git("rev-parse", "HEAD")
  const output =
    options.output === undefined
      ? yield* fs.makeTempDirectory({ directory: "/tmp/opencode", prefix: "traits-benchmark-" })
      : path.resolve(options.output)
  yield* fs.makeDirectory(output, { recursive: true })
  const baseline = path.join(output, "main-worktree")
  // Revisions before the rename keep the legacy package in traits/; link this checkout's modules into either layout.
  const linkedModules = Effect.map(fs.exists(path.join(baseline, "traits-prev")), (renamed) => [
    ["node_modules", "node_modules"] as const,
    ["traits-prev/node_modules", renamed ? "traits-prev/node_modules" : "traits/node_modules"] as const
  ])
  const baselineCleanup = Effect.gen(function* () {
    for (const [source, relative] of yield* linkedModules) {
      const link = path.join(baseline, relative)
      if (yield* fs.exists(link)) {
        const target = yield* fs.readLink(link)
        if (target !== path.join(root, source)) return yield* Effect.die(new Error(`Unexpected symlink: ${link}`))
        yield* fs.remove(link)
      }
    }
    yield* git("worktree", "remove", baseline)
  })
  yield* Effect.acquireRelease(git("worktree", "add", "--detach", baseline, baseSha), () =>
    baselineCleanup.pipe(Effect.orDie)
  )
  for (const [source, relative] of yield* linkedModules) {
    yield* fs.symlink(path.join(root, source), path.join(baseline, relative))
  }
  const entries = yield* fs.readDirectory(path.join(root, ".agents/traits"))
  const files = pipe(entries, Array.filter(String.endsWith(".md")), Array.sort(String.Order))
  const originals = yield* Effect.forEach(files, (name) =>
    Effect.gen(function* () {
      const file = path.join(root, ".agents/traits", name)
      const text = yield* fs.readFileString(file)
      return yield* Trait.parse(text, file)
    })
  )
  if (originals.length === 0) return yield* Effect.die(new Error("No source traits"))
  const fixtures = yield* Effect.forEach(options.sizes, (size) =>
    Effect.gen(function* () {
      const directory = path.join(output, `fixture-${size}`)
      yield* fs.makeDirectory(path.join(directory, "traits"), { recursive: true })
      const count = size === "real" ? originals.length : size
      let bytes = 0
      const parsed = yield* Effect.forEach(Array.range(0, count - 1), (index) =>
        Effect.gen(function* () {
          const source = originals[index % originals.length]!
          const trait =
            size === "real"
              ? source
              : Trait.Trait.make({
                  ...source,
                  name: Trait.TraitName.make(`bench-trait-${pipe(globalThis.String(index), String.padStart(6, "0"))}`),
                  context: `${source.context ?? ""}${index % 20 === 0 ? "\nbenchmark-search-needle\n" : ""}`
                })
          const text = Trait.serialize(trait)
          const file = path.join(directory, "traits", `${trait.name}.md`)
          yield* fs.writeFileString(file, text)
          bytes += Buffer.byteLength(text)
          return yield* Trait.parse(text, file)
        })
      )
      const records = Array.sort(
        parsed,
        Order.mapInput(String.Order, (trait: Trait.Trait) => trait.name)
      )
      yield* fs.writeFileString(
        path.join(directory, "expected.json"),
        JSON.stringify({ records, bytes, query: size === "real" ? "Effect" : "benchmark-search-needle" })
      )
      return { label: size, directory, count, bytes }
    })
  )
  const packageVersion = Effect.fnUntraced(function* (file: string) {
    const text = yield* fs.readFileString(path.join(root, file))
    const pkg = yield* pipe(text, S.decodeEffect(S.fromJsonString(S.Struct({ version: S.String }))))
    return pkg.version
  })
  const runtimeDependencies = yield* Effect.forEach(
    [
      ["effect", "node_modules/effect/package.json"],
      ["@effect/sql-libsql", "traits-prev/node_modules/@effect/sql-libsql/package.json"],
      ["drizzle-orm", "traits-prev/node_modules/drizzle-orm/package.json"],
      ["drizzle-kit", "traits-prev/node_modules/drizzle-kit/package.json"],
      ["yaml", "traits-prev/node_modules/yaml/package.json"]
    ] as const,
    (entry) => packageVersion(entry[1]).pipe(Effect.map((version) => [entry[0], version] as const))
  )
  const metadata = {
    baseRef: options.base,
    fileReadConcurrency: options.fileReadConcurrency,
    refreshOnly: options.refreshOnly,
    baseSha,
    headSha,
    rounds: options.rounds,
    timeMs: options.time,
    warmupMs: options.warmup,
    iterations: options.iterations,
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    cpus: os.availableParallelism(),
    gomaxprocs: yield* Config.String("GOMAXPROCS").pipe(Config.option, Effect.map(Option.getOrUndefined)),
    effectReference: yield* git("-C", "repos/Effect-TS/effect", "rev-parse", "HEAD"),
    tinybench: yield* packageVersion("node_modules/tinybench/package.json"),
    headProductionDiff: yield* git("diff", "HEAD", "--", "traits-prev"),
    runtimeDependencies: Record.fromEntries(runtimeDependencies),
    fixtures: Array.map(fixtures, (fixture) => ({ label: fixture.label, count: fixture.count, bytes: fixture.bytes }))
  }
  const runs: Array<Run> = []
  const save = Effect.suspend(() =>
    fs.writeFileString(path.join(output, "raw.json"), JSON.stringify({ metadata, runs }, null, 2))
  )
  yield* save
  yield* Console.log(`Output: ${output}`)
  yield* Effect.forEach(
    Array.range(0, options.rounds - 1),
    (round) =>
      Effect.forEach(
        fixtures,
        (fixture) =>
          Effect.gen(function* () {
            const order = round % 2 === 0 ? Model.variants : Array.reverse(Model.variants)
            yield* Effect.forEach(
              order,
              (variant) =>
                Effect.gen(function* () {
                  yield* Console.log(
                    `Round ${round + 1}/${options.rounds} ${fixture.label} (${fixture.count} traits) ${variant}`
                  )
                  const settings: Model.WorkerOptions = {
                    fileReadConcurrency: options.fileReadConcurrency,
                    refreshOnly: options.refreshOnly,
                    source: variant === "main-fs" ? baseline : root,
                    variant,
                    fixture: fixture.directory,
                    round,
                    timeMs: options.time,
                    warmupMs: options.warmup,
                    iterations: options.iterations,
                    warmupIterations: Math.min(options.iterations, 4)
                  }
                  const result = yield* execute(process.execPath, [
                    path.join(root, "tasks/bench/worker.ts"),
                    JSON.stringify(settings)
                  ]).pipe(Effect.timeout("10 minutes"))
                  const lastLine = pipe(
                    result,
                    String.trim,
                    String.split("\n"),
                    Array.last,
                    Option.getOrElse(() => "")
                  )
                  const parsed = yield* pipe(lastLine, S.decodeEffect(S.fromJsonString(Model.WorkerResult)))
                  yield* fs.writeFileString(
                    path.join(output, `${fixture.label}-${variant}-${round}.json`),
                    JSON.stringify(parsed, null, 2)
                  )
                  runs.push({ fixture: fixture.label, ...parsed })
                  yield* save
                }),
              { discard: true }
            )
          }),
        { discard: true }
      ),
    { discard: true }
  )
  const nestedComparisons = yield* Effect.forEach(fixtures, (fixture) =>
    Effect.gen(function* () {
      const byVariant = (variant: Model.WorkerResult["variant"]) =>
        pipe(
          runs,
          Array.filter((run) => run.fixture === fixture.label && run.variant === variant),
          Array.sort(Order.mapInput(Order.Number, (run: Run) => run.round))
        )
      const base = byVariant("main-fs")
      const grouped = yield* Effect.forEach(Array.drop(Model.variants, 1), (variant) =>
        Effect.gen(function* () {
          const head = byVariant(variant)
          const rows = yield* Effect.forEach(
            ["startup", ...Array.map(base[0]!.results, (result) => result.name)],
            (metric) => {
              const metricValue = (run: Model.WorkerResult) =>
                metric === "startup"
                  ? run.startup.totalMs
                  : pipe(
                      run.results,
                      Array.findFirst((result) => result.name === metric),
                      Option.getOrThrow
                    ).meanMs
              return Effect.try(() =>
                Stats.comparePairs({ base: Array.map(base, metricValue), head: Array.map(head, metricValue) })
              ).pipe(
                Effect.map((statistics) => ({
                  fixture: fixture.label,
                  count: fixture.count,
                  variant,
                  metric,
                  ...statistics
                }))
              )
            }
          )
          yield* Console.log(
            `${fixture.label} ${variant}: median SQLite bytes ${Stats.median(Array.map(head, (run) => run.databaseBytes))}, RSS delta ${Stats.median(Array.map(head, (run) => run.memory.rssDelta))}`
          )
          return rows
        })
      )
      return Array.flatten(grouped)
    })
  )
  const comparisons = Array.flatten(nestedComparisons)
  yield* fs.writeFileString(path.join(output, "comparison.json"), JSON.stringify({ metadata, comparisons }, null, 2))
  yield* Console.table(
    Array.map(comparisons, (row) => ({
      dataset: row.fixture,
      variant: row.variant,
      operation: row.metric,
      "main ms": row.baseMedianMs.toFixed(4),
      "head ms": row.headMedianMs.toFixed(4),
      speedup: `${(1 / row.headOverBase).toFixed(2)}x`,
      "95% ratio CI": `${row.lowRatio.toFixed(3)}..${row.highRatio.toFixed(3)}`
    }))
  )
}, Effect.scoped)
