import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { Schema as S } from "effect"

import { runs } from "./runs.ts"

export type logs = typeof logs
export const logs = sqliteTable(
  "logs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    runId: text()
      .notNull()
      .references(() => runs.id),
    receivedAt: integer().notNull(),
    traceId: text(),
    spanId: text(),
    timeUnixNano: text(),
    observedTimeUnixNano: text(),
    severityNumber: integer(),
    severityText: text(),
    record: text({ mode: "json" }).$type<S.JsonObject>().notNull(),
    resource: text({ mode: "json" }).$type<S.JsonObject>().notNull(),
    scope: text({ mode: "json" }).$type<S.JsonObject>().notNull(),
    resourceSchemaUrl: text().notNull(),
    scopeSchemaUrl: text().notNull()
  },
  (table) => [index("logs_run").on(table.runId), index("logs_trace").on(table.traceId)]
)
