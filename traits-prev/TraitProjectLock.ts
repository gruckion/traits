import { hostname } from "node:os"

import {
  Array,
  Clock,
  Duration,
  Effect,
  FileSystem,
  identity,
  Option,
  Path,
  pipe,
  Predicate,
  Schedule,
  Schema as S,
  String
} from "effect"
import { SecureRandom } from "effect/crypto"

import { ProjectPaths } from "./ProjectPaths.ts"

const heartbeat = Duration.seconds(15)
const staleAfter = Duration.minutes(1)

const Owner = S.fromJsonString(S.Struct({ hostname: S.String, pid: S.Int, token: S.String }))

export class TraitProjectInUseError extends S.TaggedError<TraitProjectInUseError>()("TraitProjectInUseError", {
  directory: S.String
}) {
  override get message() {
    return `A Traits MCP server already owns ${this.directory}. Connect to that server, stop it, or use a separate worktree.`
  }
}

// Signal 0 only checks existence; EPERM means the process exists but belongs to another user.
const isRunning = (pid: number) =>
  Effect.try(() => process.kill(pid, 0)).pipe(
    Effect.as(true),
    Effect.catchTags({
      UnknownError: (error) =>
        Effect.succeed(Predicate.hasProperty(error.cause, "code") && error.cause.code === "EPERM")
    })
  )

/**
 * Owns the trait directory through an exclusive `mkdir`. The holder records its process and
 * refreshes the directory's mtime, so contenders can immediately break a lock whose holder exited
 * and eventually break one whose holder stopped refreshing it.
 */
export const acquire = Effect.gen(function* () {
  const { traitsDirectory } = yield* ProjectPaths
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const crypto = yield* SecureRandom.SecureRandom.pipe(Effect.provide(SecureRandom.layerWebCrypto))
  const lockDirectory = path.join(traitsDirectory, ".mcp-lock")
  const token = yield* crypto.randomBytes(16).pipe(
    Effect.map((bytes) =>
      pipe(
        Array.fromIterable(bytes),
        Array.map((byte) => pipe(byte.toString(16), String.padStart(2, "0"))),
        Array.join("")
      )
    )
  )
  const owner = { hostname: hostname(), pid: process.pid, token }
  const inUse = TraitProjectInUseError.make({ directory: traitsDirectory })

  const readOwner = Effect.fnUntraced(function* (directory: string) {
    return yield* fs.readFileString(path.join(directory, "owner.json")).pipe(
      Effect.flatMap(S.decodeEffect(Owner)),
      Effect.orElseSucceed(() => undefined)
    )
  })
  const isAbandoned = Effect.fnUntraced(function* (directory: string) {
    const now = yield* Clock.currentTimeMillis
    const { mtime } = yield* fs.stat(directory)
    if (Option.exists(mtime, (date) => now - date.getTime() > Duration.toMillis(staleAfter))) return true
    const holder = yield* readOwner(directory)
    // PIDs are only meaningful on the host that recorded them.
    if (holder === undefined || holder.hostname !== owner.hostname) return false
    return !(yield* isRunning(holder.pid))
  })
  const create = fs.makeDirectory(lockDirectory).pipe(
    Effect.as(true),
    Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.succeed(false))
  )
  // Renaming moves the abandoned lock aside atomically. Recheck what was moved: a concurrent
  // contender may have broken the same lock and created a fresh one first.
  const breakAbandoned = Effect.gen(function* () {
    const moved = `${lockDirectory}-${owner.token}`
    yield* fs.rename(lockDirectory, moved)
    if (!(yield* isAbandoned(moved))) {
      yield* fs.rename(moved, lockDirectory).pipe(Effect.ignore)
      return yield* inUse
    }
    yield* fs.remove(moved, { recursive: true }).pipe(Effect.ignore)
  }).pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.void))

  yield* fs.makeDirectory(traitsDirectory, { recursive: true })
  yield* Effect.acquireRelease(
    Effect.gen(function* () {
      if (!(yield* create)) {
        yield* isAbandoned(lockDirectory).pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(true)),
          Effect.filterOrFail(identity, () => inUse)
        )
        yield* breakAbandoned
        yield* create.pipe(Effect.filterOrFail(identity, () => inUse))
      }
      yield* Effect.gen(function* () {
        yield* fs.writeFileString(path.join(lockDirectory, ".gitignore"), "*\n")
        const record = yield* pipe(owner, S.encodeEffect(Owner), Effect.orDie)
        yield* fs.writeFileString(path.join(lockDirectory, "owner.json"), record)
      }).pipe(Effect.onError(() => fs.remove(lockDirectory, { recursive: true }).pipe(Effect.ignore)))
    }),
    () =>
      readOwner(lockDirectory).pipe(
        Effect.flatMap((holder) =>
          holder?.token === owner.token ? fs.remove(lockDirectory, { recursive: true }) : Effect.void
        ),
        Effect.ignore
      )
  )
  yield* Clock.currentTimeMillis.pipe(
    // Numeric file times are epoch seconds.
    Effect.flatMap((now) => fs.utimes(lockDirectory, now / 1000, now / 1000)),
    Effect.ignore,
    Effect.repeat(Schedule.spaced(heartbeat)),
    Effect.forkScoped
  )
}).pipe(Effect.withSpan("TraitProjectLock.acquire"))
