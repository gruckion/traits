import { Effect, Equal, Path, Schema as S } from "effect"
import { CliError } from "effect/cli"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { CliPaths } from "./CliPaths.ts"

/** `git check-ignore` failed, so whether the path is gitignored is unknown. */
export class GitignoreError extends S.TaggedError<GitignoreError>()("GitignoreError", {
  /** The requested path, relative to the current directory. */
  path: S.String.annotateKey({ description: "The requested path, relative to the current directory." }),
  /** git check-ignore's exit code: anything but 0 (ignored) or 1 (not ignored), such as 128 outside a repository. */
  exitCode: S.Int.annotateKey({
    description:
      "git check-ignore's exit code: anything but 0 (ignored) or 1 (not ignored), such as 128 outside a repository."
  })
}) {
  override get message() {
    return `Could not check whether ${this.path} is gitignored (git exited with ${this.exitCode}). Check that the workspace is a Git repository and the path is inside it.`
  }

  override get [CliError.userMessage]() {
    return this.message
  }
}

/** Checks a literal file path relative to the workspace; tracked files are not considered ignored. */
export const match = Effect.fn("Gitignore.match")(function* (filename: string) {
  const { cwd } = yield* CliPaths
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* ChildProcess.make("git", ["check-ignore", "--quiet", "--", path.resolve(cwd, filename)], {
    cwd,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore"
  }).pipe(
    spawner.exitCode,
    Effect.filterOrFail(
      (exitCode) => exitCode === 0 || exitCode === 1,
      (exitCode) => GitignoreError.make({ path: filename, exitCode })
    ),
    Effect.map(Equal.equals(0))
  )
})
