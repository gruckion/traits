import { Array, ConfigProvider, Effect, FileSystem, Path } from "effect"

import { getGitRoot } from "./_util/Git.ts"
import { ProjectPaths } from "./ProjectPaths.ts"

export const layer = ConfigProvider.layerAdd(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const { projectRoot } = yield* ProjectPaths
    const gitRoot = yield* getGitRoot
    const files = Array.dedupe([path.join(projectRoot, ".env"), path.join(gitRoot, ".env")])
    let provider = ConfigProvider.fromUnknown({})
    for (const file of files) {
      if (yield* fs.exists(file)) {
        provider = yield* ConfigProvider.fromDotEnv({ path: file }).pipe(
          Effect.map((value) => ConfigProvider.orElse(provider, value))
        )
      }
    }
    return provider
  }).pipe(Effect.withSpan("TraitsConfigProvider.load"))
)
