import { LibsqlClient } from "@effect/sql-libsql"
// Drizzle currently exposes programmatic SQLite schema push through this Payload integration entry point.
// Keep this adapter isolated; revisit when Drizzle offers a stable standalone schema-push API.
import { pushSchema } from "drizzle-kit/payload/sqlite"
import * as LibsqlDrizzle from "drizzle-orm/effect-libsql"
import { Array, Context, Effect, FileSystem, Layer, Path } from "effect"

import { relations, T } from "./tables/index.ts"
import * as WorkspacePaths from "./WorkspacePaths.ts"

export class TraitDatabase extends Context.Service<
  TraitDatabase,
  LibsqlDrizzle.EffectLibsqlDatabase<typeof relations> & { readonly $client: LibsqlClient.LibsqlClient }
>()("traits-prev/TraitDatabase") {}

const make = Effect.fnUntraced(function* (url: string) {
  const client = yield* LibsqlClient.make({ url })
  yield* client.unsafe("PRAGMA busy_timeout = 10000")
  yield* client.unsafe("PRAGMA journal_mode = WAL")
  yield* client.unsafe("PRAGMA foreign_keys = ON")
  const db = yield* LibsqlDrizzle.makeWithDefaults({ relations }).pipe(
    Effect.provideService(LibsqlClient.LibsqlClient, client)
  )
  // Serialize complete-schema initialization across collector, MCP, and query processes.
  yield* Effect.gen(function* () {
    const services = yield* Effect.context<never>()
    const runPromise = Effect.runPromiseWith(services)
    yield* Effect.tryPromise((signal) =>
      pushSchema(T, {
        query: <T>(query: string, params?: Array<unknown>) =>
          client.unsafe(query, params).pipe(
            Effect.map((rows) => Array.fromIterable(rows) as Array<T>),
            (effect) => runPromise(effect, { signal })
          ),
        run: (query) => client.unsafe(query).pipe(Effect.asVoid, (effect) => runPromise(effect, { signal })),
        batch: (statements) =>
          Effect.forEach(statements, (query) => client.unsafe(query), { discard: true }).pipe((effect) =>
            runPromise(effect, { signal })
          )
      }).then((migration) => migration.apply())
    )
  }).pipe(client.withTransaction)
  return db
})

/** Isolated storage for tests and benchmarks; CLI processes use layerLocal. */
export const layer = Layer.effect(TraitDatabase, make("file::memory:"))

export const layerFile = (filename: string) =>
  Layer.effect(
    TraitDatabase,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      yield* fs.makeDirectory(path.dirname(filename), { recursive: true })
      const url = yield* path.toFileUrl(filename)
      return yield* make(url.href)
    })
  )

export const layerLocal = WorkspacePaths.resolve.pipe(
  Effect.map((paths) => layerFile(paths.database)),
  Layer.unwrap
)
