---
name: tagged-error-classes-for-schema-backed-failures
subject: Custom schema-backed values used as Effect failures.
assertion: Define custom schema-backed failures with Schema.TaggedError classes
  rather than Schema.TaggedStruct when they represent actual errors. Return or
  yield their effectable instances directly rather than wrapping them in
  Effect.fail. Keep tagged structs for data-only result variants.
purpose: Give failures native Error behavior, schema support, and direct Effect
  integration.
---
