---
name: named-imports-for-project-schema-utilities
subject: Imports from project-level schema utility modules and barrels. This is
  an exception to the general preference for namespace imports from local
  project modules.
assertion: Use named imports rather than namespace imports, including when
  importing more than two exports or when multiple exports would otherwise have
  aliases sharing a module-name prefix.
purpose: Keep domain schema names direct and distinguish project schema
  utilities from Effect Schema.
---
Do not use a project schema namespace such as `import * as Schema`, which can be confused with Effect Schema.