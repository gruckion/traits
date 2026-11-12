---
name: named-collection-element-types
subject: Types for collection elements and working batches.
assertion: Define and reference a descriptive named element type when typing
  collections and their working elements or batches, rather than extracting the
  element type from a collection variable with indexed access such as (typeof
  batches)[number]. Introduce a named type when none exists instead of using
  that variable-based extraction.
purpose: Make element types meaningful independently of the variables that
  happen to hold their collections.
---
```diff
-const process = (batch: (typeof batches)[number]) => batch.items
+const process = (batch: Batch) => batch.items
```
