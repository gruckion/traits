---
name: resource-aware-bulk-concurrency
subject: Concurrency choices for bulk operations.
assertion: Bound concurrency when potentially large or externally controlled
  collections could exhaust resources. Account for existing resource limits
  before adding another limiter. Use unbounded concurrency when the workload is
  predictably small or resource usage is already adequately controlled. Choose
  numeric limits using representative measurements and preserve ordering and
  consistency requirements. When unbounded concurrency relies on a limiter
  elsewhere, name that limiter in a comment at or covering the unbounded site
  (e.g. "// Decision requests are limited by Models.layerDecisionLimit"); a
  named limiter in such a comment counts as accounting for the resource limit.
  Unbounded fan-outs over potentially large or external collections with no
  visible bound and no such comment are violations.
purpose: Exploit useful parallelism without unnecessary throttling or
  uncontrolled resource consumption.
---
Violation: an unbounded fan-out over external input with no bound and no named limiter.

```ts
yield* Effect.forEach(files, (file) => model.generate(file), { concurrency: "unbounded" })
```

Correct: the limiter elsewhere is named at the site.

```ts
// Decision requests are limited by Models.layerDecisionLimit, so these fibers stay cheap.
yield* Effect.forEach(files, (file) => model.generate(file), { concurrency: "unbounded" })
```
