import { Context, Effect, FileSystem, Layer, Path, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { GitRootError } from "./_util/Git.ts"

export class ProjectPaths extends Context.Service<
  ProjectPaths,
  {
    readonly projectRoot: string
    readonly traitsDirectory: string
  }
>()("traits-prev/ProjectPaths") {}

export const layer = Layer.effect(
  ProjectPaths,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const projectRoot = yield* spawner.string(ChildProcess.make`git rev-parse --show-toplevel`).pipe(
      Effect.map(String.trim),
      Effect.filterOrFail(String.isNonEmpty, () => GitRootError.make({})),
      Effect.flatMap(fs.realPath)
    )
    const directory = path.join(projectRoot, ".agents", "traits")
    yield* fs.makeDirectory(directory, { recursive: true })
    const traitsDirectory = yield* fs.realPath(directory)
    return { projectRoot, traitsDirectory }
  })
)
