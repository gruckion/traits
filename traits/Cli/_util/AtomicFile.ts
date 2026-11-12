import { Effect, FileSystem, Path } from "effect"

import { UserFileSecurity } from "../UserFileSecurity.ts"

/** Replaces a file atomically after securing its directory and temporary file. */
export const write = Effect.fn("AtomicFile.write")(function* (filename: string, text: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const secure = yield* UserFileSecurity
  yield* fs.makeDirectory(path.dirname(filename), { recursive: true, mode: 0o700 })
  yield* secure(path.dirname(filename), "Directory")
  const temporary = yield* fs.makeTempFileScoped({ directory: path.dirname(filename), prefix: ".traits-" })
  yield* secure(temporary, "File")
  yield* fs.writeFileString(temporary, text, { mode: 0o600 })
  yield* fs.rename(temporary, filename)
}, Effect.scoped)
