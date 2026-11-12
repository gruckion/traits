---
name: sql-for-agent-data-exploration
subject: Agent-facing inspection CLIs for locally stored SQL data.
assertion: Prefer accepting SQL and returning JSON rows over maintaining a
  growing command-specific filtering interface when agents need flexible
  exploration of the stored data.
purpose: Let agents use existing SQL capabilities for filtering, joins,
  projections, and aggregation while keeping the CLI small.
---
