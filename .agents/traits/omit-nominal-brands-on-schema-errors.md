---
name: omit-nominal-brands-on-schema-errors
subject: Type arguments of Effect Schema error class signatures such as
  `S.TaggedError<Self, Brand>()` and `S.ErrorClass<Self, Brand>()`.
assertion: Omit the optional second `Brand` type argument on Schema error
  classes rather than passing it solely to satisfy schema-class-missing-brand
  linting. The first `Self` type argument (the class itself, e.g.
  `S.TaggedError<MyError>()`) is required and is not a brand; never flag it.
purpose: Keep error signatures concise without unnecessary type-level complexity.
---
In effect 4.1 the signature is `TaggedError<Self = never, Brand = {}>(identifier?)`. Only the second type argument is the nominal brand.

```diff
-export class MyError extends S.TaggedError<MyError, { readonly MyError: unique symbol }>()("MyError", {
+export class MyError extends S.TaggedError<MyError>()("MyError", {
   message: S.String,
 }) {}
```

`S.TaggedError<MyError>()("MyError", { ... })` with a single type argument satisfies this trait.
