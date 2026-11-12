import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { Schema as S } from "effect"

import { runs } from "./runs.ts"

export type spans = typeof spans
export const spans = sqliteTable(
  "spans",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    runId: text()
      .notNull()
      .references(() => runs.id),
    receivedAt: integer().notNull(),
    traceId: text(),
    spanId: text(),
    parentSpanId: text(),
    name: text(),
    startTimeUnixNano: text(),
    endTimeUnixNano: text(),
    statusCode: integer(),
    record: text({ mode: "json" }).$type<S.JsonObject>().notNull(),
    resource: text({ mode: "json" }).$type<S.JsonObject>().notNull(),
    scope: text({ mode: "json" }).$type<S.JsonObject>().notNull(),
    resourceSchemaUrl: text().notNull(),
    scopeSchemaUrl: text().notNull()
  },
  (table) => [index("spans_run").on(table.runId), index("spans_trace").on(table.traceId)]
)
