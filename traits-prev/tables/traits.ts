import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export type traits = typeof traits
export const traits = sqliteTable("traits", {
  name: text().primaryKey(),
  subject: text().notNull(),
  requirement: text().notNull(),
  applicability: text(),
  purpose: text().notNull(),
  context: text()
})
