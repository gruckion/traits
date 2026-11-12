import { Array, ConfigProvider, Effect, FileSystem, Path, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { WorkspaceRoot } from "./WorkspaceRoot.ts"

/** The main checkout root shared by the workspace's linked worktrees; undefined outside Git. */
const mainCheckoutRoot = Effect.gen(function* () {
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const { directory } = yield* WorkspaceRoot
  const handle = yield* spawner.spawn(
    ChildProcess.make("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: directory,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore"
    })
  )
  const { exitCode, stdout } = yield* Effect.all(
    { exitCode: handle.exitCode, stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString) },
    { concurrency: "unbounded" }
  )
  const commonDirectory = String.trim(stdout)
  return exitCode === 0 && commonDirectory !== "" ? path.dirname(commonDirectory) : undefined
}).pipe(
  Effect.scoped,
  Effect.orElseSucceed(() => undefined)
)

/** Falls back from the process environment to the workspace's .env, then to the main checkout's .env, so linked worktrees share its credentials. */
export const layer = ConfigProvider.layerAdd(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const { directory } = yield* WorkspaceRoot
    const root = yield* mainCheckoutRoot
    const files = Array.dedupe([path.join(directory, ".env"), ...(root === undefined ? [] : [path.join(root, ".env")])])
    // The workspace's .env takes precedence over the main checkout's, in file order.
    const dotEnvs = yield* Effect.forEach(files, (file) =>
      fs
        .exists(file)
        .pipe(
          Effect.flatMap((exists) =>
            exists ? Effect.asSome(ConfigProvider.fromDotEnv({ path: file })) : Effect.succeedNone
          )
        )
    )
    return Array.reduce(Array.getSomes(dotEnvs), ConfigProvider.fromUnknown({}), ConfigProvider.orElse)
  }).pipe(Effect.withSpan("WorkspaceConfigProvider.load"))
)
