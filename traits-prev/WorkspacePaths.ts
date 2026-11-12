import { Effect, Path, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

export const resolve = Effect.gen(function* () {
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const cwd = path.resolve()
  const root = yield* spawner
    .string(
      ChildProcess.make("git", ["rev-parse", "--show-toplevel"], {
        stderr: "ignore"
      })
    )
    .pipe(
      Effect.map(String.trim),
      Effect.orElseSucceed(() => cwd)
    )
  const directory = path.join(root, ".agents", "traits")
  return { cwd, directory, database: path.join(directory, "traits.sqlite") }
})
