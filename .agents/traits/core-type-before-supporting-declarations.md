---
name: core-type-before-supporting-declarations
subject: TypeScript modules whose core abstraction is represented by an
  interface or type-only declaration.
assertion: Place the interface or type-only declaration representing the
  module's core abstraction directly after imports, before supporting
  declarations such as error definitions.
purpose: Let readers encounter the module's primary contract before its
  supporting details.
---
For example, put TraitsStore and TraitsEnvironmentStore interfaces immediately after imports, with their operation-specific error classes below them. This rule concerns type-only core declarations, not runtime classes or schema values.