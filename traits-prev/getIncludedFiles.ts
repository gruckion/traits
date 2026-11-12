import { Array, Effect, Equal, Path, pipe, Schema as S, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { TraitsContext } from "./TraitsContext.ts"

export class GitFileListingError extends S.TaggedError<GitFileListingError>()("GitFileListingError", {
  directory: S.String,
  exitCode: S.Int.check(S.isGreaterThan(0))
}) {
  override get message() {
    return `git ls-files exited with code ${this.exitCode}`
  }
}

export const getIncludedFiles = Effect.gen(function* () {
  const context = yield* TraitsContext
  if (!context.config.excludeGitignored) return undefined

  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const process = yield* spawner.spawn(
    ChildProcess.make`git ls-files --cached --others --exclude-standard --full-name -z`.pipe(
      ChildProcess.setCwd(context.configRoot)
    )
  )
  const output = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString)
  yield* process.exitCode.pipe(
    Effect.filterOrFail(Equal.equals(0), (exitCode) =>
      GitFileListingError.make({
        directory: context.configRoot,
        exitCode
      })
    )
  )
  return pipe(
    output,
    String.split("\0"),
    Array.filter(String.isNonEmpty),
    Array.map((file) => path.resolve(context.configRoot, file)),
    (files) => new Set(files)
  )
}).pipe(Effect.scoped, Effect.withSpan("getIncludedFiles"))
