---
name: preserve-drizzle-relations-in-service-types
subject: Drizzle-backed Effect database service types.
assertion: Preserve configured table and relations metadata and client
  properties in the database service type rather than using an unparameterized
  database type that defaults to empty relations. Prefer declaring the shape
  inline with the concrete database type parameterized by typeof a shared
  relations value and its client property, and inline the configured constructor
  call at initialization instead of introducing an Effect constant solely to
  extract its success type.
purpose: Retain typed relational queries and keep the service declaration
  aligned with runtime relations while avoiding unnecessary constructor-Effect
  indirection.
---
