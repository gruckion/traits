---
name: built-in-json-object-schema
subject: Effect Schema definitions for arbitrary JSON objects.
assertion: Use Schema.JsonObject for arbitrary JSON objects instead of defining
  an equivalent ad hoc record schema such as Schema.Record(Schema.String,
  Schema.Unknown). Keep explicit schemas when validating a specific object
  structure.
purpose: Reuse the built-in schema and restrict arbitrary object values to
  JSON-compatible data.
---
