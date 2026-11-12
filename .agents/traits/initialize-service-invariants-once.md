---
name: initialize-service-invariants-once
subject: One-off setup used by effectful methods returned by an Effect service or layer.
assertion: Perform setup that is invariant for a service instance, such as
  loading modules or creating shared synchronization primitives, in the service
  or layer initialization effect and capture the results in its returned
  methods. Do not repeat that setup inside each method invocation. Keep
  request-dependent work, intentionally refreshed data, and resources whose
  lifetime belongs to an individual operation inside that operation.
purpose: Avoid redundant per-call setup and make service-instance ownership and
  lifetimes explicit.
---
