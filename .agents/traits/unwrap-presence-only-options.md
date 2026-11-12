---
name: unwrap-presence-only-options
subject: Options used only for presence checks and contained-value access. In
  TypeScript or TSX files.
assertion: "When an Option is used only to check presence and access its value,
  unwrap it with Option.getOrUndefined rather than repeatedly using
  Option.isSome and .value: yield*
  effect.pipe(Effect.map(Option.getOrUndefined)). Access the value directly and
  use explicit undefined checks where strict-boolean linting requires them.
  Retain Option when its combinators or distinction between Some(undefined) and
  None are needed."
purpose: Reduce repeated presence-check scaffolding when the richer Option
  representation provides no additional value.
---
```diff
-const result = yield* lookup
-if (Option.isSome(result)) use(result.value)
+const result = yield* lookup.pipe(Effect.map(Option.getOrUndefined))
+if (result !== undefined) use(result)
```
