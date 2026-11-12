---
name: prefer-relational-columns-for-structured-data
subject: SQL storage representations of structured records.
assertion: "Prefer dedicated columns for structured record fields instead of
  storing an entire record in a serialized column. Use a serialized column only
  when a concrete requirement warrants preserving the value as an artifact, such
  as an externally standardized, versioned, schema-bearing x402 payment payload.
  This concerns database representation: storage APIs should still accept
  complete domain objects and preserve their content."
purpose: Keep fields directly queryable and simplify future schema migrations
  without breaking contracts that genuinely require serialized artifacts.
---
