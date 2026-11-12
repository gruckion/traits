---
name: preconfigure-request-concurrency-transformers
subject: Shared concurrency controls used with a fixed permit count around
  individual Effect requests.
assertion: Expose a preconfigured Effect transformation instead of the raw
  semaphore when consumers only apply the same permit count. Construct the
  shared limiter once, use identity when concurrency is unbounded, and apply the
  transformation directly to the individual request effects rather than
  enclosing tool workflows.
purpose: Keep concurrency scope precise and call sites simple without
  unnecessary semaphore work in unbounded mode.
---
