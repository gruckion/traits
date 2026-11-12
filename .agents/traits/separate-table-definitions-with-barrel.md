---
name: separate-table-definitions-with-barrel
subject: Database table definitions.
assertion: Place database table definitions in a tables directory, with one
  table per file, and re-export every table through that directory’s index.ts
  using export * declarations.
purpose: Keep table definitions independently discoverable and expose the
  complete database schema through one barrel.
---
