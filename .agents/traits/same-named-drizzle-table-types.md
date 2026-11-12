---
name: same-named-drizzle-table-types
subject: Exported Drizzle table definitions and their inferred model types.
assertion: Export a same-named alias for each table’s complete type immediately
  above its value declaration, such as export type traits = typeof traits before
  export const traits. Access inferred models through that type’s properties,
  such as traits["$inferSelect"] or traits["$inferInsert"], instead of exporting
  separate model aliases.
purpose: Expose the table and all its inferred model types through one
  consistent identity without redundant type exports.
---
