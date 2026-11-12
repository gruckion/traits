import { Effect, FileSystem } from "effect"

export const databaseDirectory = Effect.fnUntraced(function* (prefix: string) {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped({ prefix })
  // libSQL native statements retain file handles after SDK close until GC.
  // Registered here, this runs after database scopes close and before directory cleanup.
  yield* Effect.addFinalizer(() =>
    Effect.callback<void>((resume) => {
      if (global.gc === undefined) return resume(Effect.die("Database tests require --expose-gc"))
      global.gc()
      setImmediate(() => resume(Effect.void))
    })
  )
  return directory
})
