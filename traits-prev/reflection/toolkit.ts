import { Cause, Effect, Layer, Schema as S } from "effect"
import { McpServer, Tool, Toolkit } from "effect/ai"

import { TraitDatabase } from "../TraitDatabase.ts"

export class QueryError extends S.TaggedError<QueryError>()("QueryError", {
  details: S.String
}) {}

const tools = Toolkit.make(
  Tool.make("query", {
    description:
      "Execute SQLite SQL against the worktree reflection database. Tables include spans, logs, and runs. Returns JSON rows; record, resource, and scope columns contain JSON text. Use SQLite JSON functions, joins, ordering, and limits as needed. Inspect columns with PRAGMA table_info(logs) or PRAGMA table_info(spans).",
    parameters: S.Struct({ sql: S.NonEmptyString.annotate({ description: "SQLite statement to execute" }) }),
    success: S.Array(S.JsonObject),
    failure: QueryError,
    failureMode: "return",
    dependencies: [TraitDatabase]
  })
)

export const toolkit = McpServer.toolkit(tools).pipe(
  Layer.provide(
    McpServer.middleware<{ readonly provides: TraitDatabase }>()(
      Effect.map(Effect.context<TraitDatabase>(), (context) => (effect) => Effect.provide(effect, context))
    ).layer
  ),
  Layer.provide(
    tools.toLayer({
      query: Effect.fnUntraced(
        function* (params) {
          const db = yield* TraitDatabase
          return yield* db.$client.unsafe(params.sql).pipe(Effect.flatMap(S.decodeUnknownEffect(S.Array(S.JsonObject))))
        },
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) ? Effect.interrupt : QueryError.make({ details: Cause.pretty(cause) })
        )
      )
    })
  )
)
