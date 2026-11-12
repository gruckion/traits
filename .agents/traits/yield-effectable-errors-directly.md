---
name: yield-effectable-errors-directly
subject: Returning and yielding error values that are themselves effectable. In
  TypeScript or TSX files.
assertion: "When an Effect error value is itself effectable, return or yield it
  directly instead of wrapping it with Effect.fail: return error, not return
  Effect.fail(error). Keep Effect.fail for error values that are not
  effectable."
purpose: Express effectable failures directly without redundant failure wrappers.
---
```diff
-return yield* Effect.fail(MissingDocument.make({ path }))
+return yield* MissingDocument.make({ path })
```
