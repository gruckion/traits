---
name: inline-single-consumer-effect-helper-bundles
subject: Effect initialization helpers that return utility objects consumed by a
  single layer implementation.
assertion: Define the utilities directly within the consuming layer's
  initialization generator instead of using a separate Effect that constructs
  and returns a helper bundle. Retain a separate helper when it is reused or
  establishes a meaningful resource-lifecycle or abstraction boundary.
purpose: Keep dependencies and implementation logic together without redundant
  initialization, context binding, or intermediate utility objects.
---
