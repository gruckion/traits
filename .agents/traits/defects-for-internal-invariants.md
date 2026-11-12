---
name: defects-for-internal-invariants
subject: Classification of internal invariant violations and recoverable
  failures in Effect error channels. Applies to Effect error-channel design,
  including library validation and encoding of internally constructed data in
  TypeScript and TSX.
assertion: Treat genuine internal invariant violations as defects, including
  validation or encoding failures of internally constructed, already-typed data
  when consumers cannot meaningfully recover. Preserve typed errors for
  actionable failures such as invalid consumer input, configuration, network,
  storage, and recoverable encoding failures. Neither typed input nor a
  handler's failure to catch an error is sufficient reason to classify a
  recoverable failure as a defect.
purpose: Keep recoverable error channels focused on actionable failures while
  exposing genuine internal invariant violations as defects.
---
For encoding that genuinely checks an internal invariant with no meaningful consumer recovery, use `Effect.orDie` rather than exposing `SchemaError` in the public error channel. This example does not apply to recoverable encoding failures.

```diff
-return pipe(internallyConstructed, S.encodeEffect(schema))
+return pipe(internallyConstructed, S.encodeEffect(schema), Effect.orDie)
```

Using `Schema.Defect()` (e.g. `cause: S.Defect()`) as the schema of an error's cause field does not classify a failure as a defect; it only describes how an arbitrary cause value is encoded. Judge only what is placed in the typed error channel versus the defect channel (`Effect.die`, `Effect.orDie`, thrown exceptions). An interface-only contract declaring typed storage errors in its method signatures is not a violation.

Violation: a recoverable storage failure is converted to a defect.

```ts
const read = fs.readFileString(path).pipe(Effect.orDie)
```

Not a violation: `Effect.orDie` on an operation whose typed failure is ruled out by earlier code in the same function, such as `path.toFileUrl(path.resolve(file)).pipe(Effect.orDie)`, since a resolved absolute path always converts. A short comment stating the invariant makes this explicit.
