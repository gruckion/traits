---
name: parallelize-independent-effects
subject: Independent Effect operations within a workflow.
assertion: Prefer explicit parallel composition for Effect operations that do
  not depend on one another's results and can safely overlap, rather than
  sequential yield statements. Use Effect.all with an explicit concurrency
  option; use unbounded concurrency for predictably small, independent groups.
  Retain necessary sequencing for dependent results, shared mutable state,
  ordered side effects, and resource-lifecycle or failure semantics. Respect
  resource and rate limits for larger workloads.
purpose: Avoid unnecessary waiting while keeping dependencies and concurrency
  policy explicit.
---
```diff
-const a = yield* loadA
-const b = yield* loadB
+const [a, b] = yield* Effect.all([loadA, loadB], { concurrency: "unbounded" })
```

Independent dynamic imports and configuration lookups are examples; independence must include side effects, not just return values.