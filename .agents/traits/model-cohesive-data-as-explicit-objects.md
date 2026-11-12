---
name: model-cohesive-data-as-explicit-objects
subject: Domain models whose related fields are repeatedly extracted or assembled.
assertion: When domain operations repeatedly pick, omit, or filter fields to
  assemble related values, prefer reshaping the domain types into cohesive
  explicit objects that can be constructed or replaced directly. Nesting types
  and retaining nested data are acceptable when they make passing the
  corresponding data more concise and minimal; do not flatten solely for a flat
  shape. Keep representation-specific flattening and field extraction at
  serialization boundaries rather than scattering it through domain operations.
purpose: Keep related domain data together and reduce repeated field bookkeeping
  across operations.
---
```diff
-const updated = { ...Struct.omit(existing, ["when", "mime", "skip"]), ...scope }
+const updated = { ...existing, applicability: scope }
```
