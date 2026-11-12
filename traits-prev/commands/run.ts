import { eq } from "drizzle-orm"
import { Array, Cause, Clock, Config, Effect, Exit, Path, Runtime, Schema as S, Stdio } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { SecureRandom } from "effect/crypto"
import { Hex } from "effect/encoding"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { serve } from "../reflection/serve.ts"
import { T } from "../tables/index.ts"
import * as TraitDatabase from "../TraitDatabase.ts"
import * as WorkspacePaths from "../WorkspacePaths.ts"

class ChildExitError extends S.TaggedError<ChildExitError>()("ChildExitError", { exitCode: S.Int }) {
  override readonly [Runtime.errorExitCode] = this.exitCode
  override readonly [Runtime.errorReported] = false
}

export const run = Command.make(
  "run",
  {
    id: Flag.String("id").pipe(
      Flag.withSchema(S.NonEmptyString.check(S.isPattern(/\S/, { message: "Section ID must not be blank" }))),
      Flag.withDescription("Stable section ID identifying this script within the worktree")
    ),
    command: Argument.String("command").pipe(Argument.withSchema(S.NonEmptyString)),
    args: Argument.String("args").pipe(Argument.withSchema(S.NonEmptyString), Argument.variadic())
  },
  Effect.fnUntraced(function* (options) {
    const stdio = yield* Stdio.Stdio
    const args = yield* stdio.args
    const shell = !Array.contains(args, "--") && options.args.length === 0
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const { cwd, database } = yield* WorkspacePaths.resolve
    const crypto = yield* SecureRandom.SecureRandom.pipe(Effect.provide(SecureRandom.layerWebCrypto))
    const runId = yield* crypto.randomBytes(16).pipe(Effect.map(Hex.encode))
    yield* Effect.gen(function* () {
      const db = yield* TraitDatabase.TraitDatabase
      const startedAt = yield* Clock.currentTimeMillis
      yield* db.insert(T.runs).values({
        id: runId,
        sectionId: options.id,
        command: [options.command, ...options.args],
        shell,
        cwd,
        startedAt
      })
      yield* Effect.addFinalizer(
        Effect.fnUntraced(function* (exit) {
          const endedAt = yield* Clock.currentTimeMillis
          const exitCode = Exit.isSuccess(exit)
            ? 0
            : Cause.hasInterruptsOnly(exit.cause)
              ? 130
              : Runtime.getErrorExitCode(Cause.squash(exit.cause))
          yield* db.update(T.runs).set({ endedAt, exitCode }).where(eq(T.runs.id, runId)).pipe(Effect.orDie)
        })
      )
      const endpoint = yield* serve(runId)
      const serviceName = yield* Config.String("OTEL_SERVICE_NAME").pipe(
        Config.withDefault(shell ? "traits-child" : path.basename(options.command))
      )
      // exitCode scopes the child inside the collector, terminating and awaiting it before the receiver closes.
      const exitCode = yield* spawner.exitCode(
        ChildProcess.make(options.command, options.args, {
          shell,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          extendEnv: true,
          env: {
            OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
            OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${endpoint}/v1/logs`,
            OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "http/json",
            OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
            OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${endpoint}/v1/traces`,
            OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/json",
            OTEL_LOGS_EXPORTER: "otlp",
            OTEL_SERVICE_NAME: serviceName,
            OTEL_TRACES_EXPORTER: "otlp"
          }
        })
      )
      if (exitCode !== 0) return yield* ChildExitError.make({ exitCode })
    }).pipe(Effect.scoped, Effect.provide(TraitDatabase.layerFile(database)))
  })
).pipe(Command.withDescription("Run a command with a local OTLP traces and logs receiver"))
