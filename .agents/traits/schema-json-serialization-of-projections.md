---
name: schema-json-serialization-of-projections
subject: Serializing a selected subset of an existing object to JSON in Effect code.
assertion: Select unchanged fields with Struct.pick and serialize the result
  with an Effect Schema JSON encoder rather than manually rebuilding the subset
  and calling JSON.stringify. Reuse an existing suitable schema, including
  Schema.JsonObject for arbitrary JSON objects.
purpose: Keep field selection explicit and JSON serialization within a typed
  Effect pipeline.
---
