---
name: table-namespace-and-relations-barrel
subject: Database table definitions and their shared relations exports.
assertion: Place database table definitions in a tables directory, one table per
  file. Re-export every table with export * from its file in tables/T.ts. Define
  shared relations in tables/relations.ts. In tables/index.ts, export * as T
  from "./T.ts" and export * from "./relations.ts". Consumers import T for table
  references and import relations directly from the index rather than redefining
  them.
purpose: Keep individual table definitions discoverable while providing a
  consistent table namespace and one shared relations definition.
---
