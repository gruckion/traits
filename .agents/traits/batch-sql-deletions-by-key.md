---
name: batch-sql-deletions-by-key
subject: SQL operations deleting multiple records by key.
assertion: Prefer one set-based DELETE with an IN predicate, such as Drizzle
  inArray, over issuing one DELETE per key. Pass the complete key list directly
  to companion storage operations that already accept batches. Use bounded
  chunks when database parameter limits require them.
purpose: Reduce database round trips and redundant per-item orchestration.
---
