import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export type runs = typeof runs
export const runs = sqliteTable(
  "runs",
  {
    id: text().primaryKey(),
    // Historical runs created before --id was required have no section ID.
    sectionId: text(),
    command: text({ mode: "json" }).$type<ReadonlyArray<string>>().notNull(),
    shell: integer({ mode: "boolean" }).notNull().default(false),
    cwd: text().notNull(),
    startedAt: integer().notNull(),
    endedAt: integer(),
    exitCode: integer(),
    signal: text()
  },
  (table) => [index("runs_section_id").on(table.sectionId)]
)
