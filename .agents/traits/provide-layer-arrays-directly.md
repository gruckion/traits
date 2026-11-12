---
name: provide-layer-arrays-directly
subject: Providing multiple independent layers to an Effect or a Layer.
assertion: Use Effect.provide([layerA, layerB, ...]) or Layer.provide([layerA,
  layerB, ...]) instead of Effect.provide(Layer.mergeAll(layerA, layerB, ...))
  or Layer.provide(Layer.mergeAll(...)) when merging only to supply those
  layers. Retain explicit layer composition when the
  merged layer is reused or further composition is necessary.
purpose: Avoid redundant layer-merging scaffolding while preserving dependency
  composition semantics.
---
