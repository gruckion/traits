import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Array, Effect, FileSystem, Path, pipe, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { Reactivity } from "effect/reactivity"

import { T } from "../../tables/index.ts"
import * as Database from "../../TraitDatabase.ts"
import { databaseDirectory } from "../fixtures/databaseDirectory.ts"

// Windows process termination does not deliver POSIX signals to Node handlers.
it.effect.skipIf(process.platform === "win32")(
  "keeps ingestion alive while a signalled child flushes its finalizers",
  Effect.fnUntraced(
    function* () {
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const directory = yield* databaseDirectory("reflection-")
      const cli = path.resolve(import.meta.dirname, "../../main.ts")
      const fixture = path.resolve(import.meta.dirname, "../fixtures/telemetry.ts")
      const child = yield* spawner.spawn(
        ChildProcess.make(
          process.execPath,
          [cli, "run", "--id", "shutdown", "--", process.execPath, fixture, "json", "wait"],
          {
            cwd: directory
          }
        )
      )
      yield* child.stdout.pipe(Stream.decodeText(), Stream.splitLines, Stream.take(1), Stream.runDrain)
      yield* child.kill({ killSignal: "SIGTERM" })
      yield* child.exitCode
      yield* Effect.gen(function* () {
        const db = yield* Database.TraitDatabase
        const logs = yield* db.select().from(T.logs)
        expect(Array.some(logs, (row) => pipe(JSON.stringify(row.record), String.includes("shutdown log")))).toBe(true)
        const runs = yield* db.select().from(T.runs)
        expect(runs[0]!.endedAt).not.toBeNull()
      }).pipe(Effect.provide(Database.layerFile(path.join(directory, ".agents", "traits", "traits.sqlite"))))
    },
    Effect.provide([NodeServices.layer, Reactivity.layer])
  )
)

it.effect(
  "shares a database across concurrent runs at the linked worktree root",
  Effect.fnUntraced(
    function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const directory = yield* databaseDirectory("reflection-")
      const repository = path.join(directory, "main")
      const worktree = path.join(directory, "worktree")
      const nested = path.join(worktree, "nested")
      const git = Effect.fnUntraced(function* (args: ReadonlyArray<string>) {
        return yield* spawner.string(ChildProcess.make("git", args, { cwd: directory, stderr: "ignore" }))
      })
      yield* git(["init", repository])
      yield* git([
        "-C",
        repository,
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "--allow-empty",
        "-m",
        "initial"
      ])
      yield* git(["-C", repository, "worktree", "add", "--detach", worktree])
      yield* fs.makeDirectory(nested)
      const cli = path.resolve(import.meta.dirname, "../../main.ts")
      const command = (sectionId: string) =>
        ChildProcess.make(
          process.execPath,
          [
            cli,
            "run",
            "--id",
            sectionId,
            "--",
            process.execPath,
            "-e",
            "const r = await fetch(process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ severityNumber: 17 }] }] }] }) }); if (r.status !== 200) process.exitCode = 1"
          ],
          { cwd: nested }
        )
      const codes = yield* Effect.all([spawner.exitCode(command("alpha")), spawner.exitCode(command("beta"))], {
        concurrency: 2
      })
      expect(codes).toEqual([0, 0])
      const mainHasDatabase = yield* fs.exists(path.join(repository, ".agents", "traits", "traits.sqlite"))
      const nestedHasDatabase = yield* fs.exists(path.join(nested, ".agents", "traits", "traits.sqlite"))
      expect(mainHasDatabase).toBe(false)
      expect(nestedHasDatabase).toBe(false)
      yield* Effect.gen(function* () {
        const db = yield* Database.TraitDatabase
        const runs = yield* db.select().from(T.runs)
        const exports = yield* db.select().from(T.logs)
        expect(runs).toHaveLength(2)
        expect(exports).toHaveLength(2)
        expect(exports[0]!.runId).not.toBe(exports[1]!.runId)
        const sections = yield* db
          .select({ sectionId: T.runs.sectionId })
          .from(T.logs)
          .innerJoin(T.runs, eq(T.logs.runId, T.runs.id))
        expect(sections).toEqual(expect.arrayContaining([{ sectionId: "alpha" }, { sectionId: "beta" }]))
      }).pipe(Effect.provide(Database.layerFile(path.join(worktree, ".agents", "traits", "traits.sqlite"))))
    },
    Effect.provide([NodeServices.layer, Reactivity.layer])
  )
)

it.effect(
  "rejects missing or blank section IDs before starting a run",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "reflection-" })
    const cli = path.resolve(import.meta.dirname, "../../main.ts")
    for (const flags of [[], ["--id", ""], ["--id", " "]]) {
      const child = yield* spawner.spawn(
        ChildProcess.make(
          process.execPath,
          [cli, "run", ...flags, "--", process.execPath, "-e", "console.log('started')"],
          { cwd: directory }
        )
      )
      const [stdout, exitCode] = yield* Effect.all(
        [child.stdout.pipe(Stream.decodeText(), Stream.mkString), child.exitCode],
        { concurrency: "unbounded" }
      )
      expect(exitCode).not.toBe(0)
      expect(stdout).not.toContain("started")
    }
    const created = yield* fs.exists(path.join(directory, ".agents", "traits", "traits.sqlite"))
    expect(created).toBe(false)
  }, Effect.provide(NodeServices.layer))
)

it.effect(
  "reports a signal-terminated child as a platform failure and completes its run record",
  Effect.fnUntraced(
    function* () {
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const directory = yield* databaseDirectory("reflection-signal-")
      const cli = path.resolve(import.meta.dirname, "../../main.ts")
      const code = yield* spawner.exitCode(
        ChildProcess.make(
          process.execPath,
          [cli, "run", "--id", "signal", "--", process.execPath, "-e", 'process.kill(process.pid, "SIGTERM")'],
          { cwd: directory }
        )
      )
      expect(code).toBe(1)
      yield* Effect.gen(function* () {
        const db = yield* Database.TraitDatabase
        const runs = yield* db.select().from(T.runs)
        expect(runs).toMatchObject([{ exitCode: 1, signal: null, endedAt: expect.any(Number) }])
      }).pipe(Effect.provide(Database.layerFile(path.join(directory, ".agents", "traits", "traits.sqlite"))))
    },
    Effect.provide([NodeServices.layer, Reactivity.layer])
  )
)
