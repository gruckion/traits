---
name: effect-fn-transformations-for-operation-error-boundaries
subject: Whole-operation error translation in reusable Effect functions. Applies
  only where a reusable function translates failures of its stages uniformly
  into one operation-specific error for recovery or a meaningful external
  boundary. Raising domain rejections from successful values (e.g.
  Effect.filterOrFail) is not translation.
assertion: Use Effect.fn transformation arguments to apply a uniform error
  translation around the whole reusable function rather than repeating it per
  stage or applying it only to some stages. Stage-local translation is
  acceptable when stages need distinct actionable context (different messages
  or fields), provided no recoverable failure of the operation escapes
  untranslated.
purpose: Ensure reusable functions apply their recoverable error contract
  consistently across all operational stages.
---
Keep caller-owned operation errors outside unrelated wrappers and genuine internal invariant violations outside recoverable error translation. A function that only raises domain rejections while letting built-in errors propagate has no translation boundary and is not in scope.

Violation: the same uniform translation is applied to only some stages, so the write failure escapes.

```ts
const save = Effect.fn("save")(function*(path: string, value: Config) {
  const text = yield* S.encodeEffect(ConfigJson)(value).pipe(Effect.mapError((cause) => SaveError.make({ path, cause })))
  yield* fs.writeFileString(path, text) // PlatformError escapes untranslated
})
```

Correct:

```ts
const save = Effect.fn("save")(
  function*(path: string, value: Config) {
    const text = yield* S.encodeEffect(ConfigJson)(value)
    yield* fs.writeFileString(path, text)
  },
  (effect, path) => effect.pipe(Effect.mapError((cause) => SaveError.make({ path, cause }))),
)
```

Also fine: each stage maps to `SecurityError` with a distinct actionable message ("run `chmod 600 <file>`" vs "remove the symlink at <file>"), and every recoverable failure is covered.
