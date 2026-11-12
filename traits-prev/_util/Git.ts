import { Effect, Path, Schema as S, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

export class GitRootError extends S.TaggedError<GitRootError>()("GitRootError", {}) {
  override get message() {
    return "Run from inside a Git repository or worktree"
  }
}

const resolveRoot = Effect.fn("Git.resolveRoot")(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* spawner.string(command).pipe(
    Effect.map(String.trim),
    Effect.filterOrFail(String.isNonEmpty, () => GitRootError.make({}))
  )
})

/** The main checkout root, shared by its linked worktrees. */
export const getGitRoot = Effect.gen(function* () {
  const path = yield* Path.Path
  const gitDir = yield* resolveRoot(ChildProcess.make`git rev-parse --path-format=absolute --git-common-dir`)
  return path.dirname(gitDir)
})
