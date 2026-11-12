---
name: accurate-service-operation-error-unions
subject: Errors exposed by each operation in an explicit Effect service contract.
assertion: Expose only errors the operation can actually produce, rather than a
  shared catch-all error union.
purpose: Allow callers to reason about and handle only failures that are
  possible for the operation.
---
A read operation should not expose `ReadError | WriteError` when it cannot produce `WriteError`.