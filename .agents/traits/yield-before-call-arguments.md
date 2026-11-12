---
name: yield-before-call-arguments
subject: Effect generator results passed to transformations or function calls.
  In TypeScript or TSX files.
assertion: "Avoid yield* expressions inside function-call arguments in Effect
  generators. Apply the enclosing transformation to the effect and yield the
  result: provider = yield* load.pipe(Effect.map((value) =>
  ConfigProvider.orElse(provider, value))), not provider =
  ConfigProvider.orElse(provider, yield* load). If composing is unclear, yield
  into a local variable first. This includes test assertions
  (expect(yield* load).toBe(x) becomes const value = yield* load;
  expect(value).toBe(x)) and yielded values used as a .pipe(...) receiver
  ((yield* S).pipe(f) becomes yield* S.pipe(Effect.map(f)))."
purpose: Keep effect sequencing separate from call arguments so evaluation order
  remains easy to follow.
---
```diff
-const result = transform(yield* load)
+const result = yield* load.pipe(Effect.map(transform))
```

Test assertions:

```diff
-expect(yield* TraitsConfig.load).toEqual(expected)
+const config = yield* TraitsConfig.load
+expect(config).toEqual(expected)
```

Yielded value as a `.pipe` receiver:

```diff
-const names = (yield* listTraits).pipe(Array.map((trait) => trait.name))
+const names = yield* listTraits.pipe(Effect.map(Array.map((trait) => trait.name)))
```
