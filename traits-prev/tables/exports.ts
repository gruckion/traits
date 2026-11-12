import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { runs } from "./runs.ts"

// Legacy batches are retained for existing worktrees; new ingestion writes spans/logs only.
export type exports = typeof exports
export const exports = sqliteTable(
  "exports",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    runId: text()
      .notNull()
      .references(() => runs.id),
    signal: text({ enum: ["traces", "logs"] }).notNull(),
    contentType: text({ enum: ["application/json", "application/x-protobuf"] }).notNull(),
    receivedAt: integer().notNull(),
    payload: blob({ mode: "buffer" }).notNull()
  },
  (table) => [index("exports_run_signal").on(table.runId, table.signal)]
)
