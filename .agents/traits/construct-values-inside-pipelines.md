---
name: construct-values-inside-pipelines
subject: Final value construction in transformation pipelines. In TypeScript or
  TSX files.
assertion: "Keep final value construction inside a transformation pipeline
  rather than wrapping the pipeline in a constructor call: use pipe(values,
  transform, (items) => new Set(items)), not new Set(pipe(values, transform)).
  This also applies to other constructors when the construction is the final
  transformation."
purpose: Let readers follow transformations and final construction in execution order.
---
```diff
-const names = new Set(pipe(items, Array.map((item) => item.name)))
+const names = pipe(items, Array.map((item) => item.name), (values) => new Set(values))
```
