---
name: effect-based-exception-handling
subject: Throwable synchronous operations and Promise failures in application
  code. In TypeScript, TSX, JavaScript, or JSX files.
assertion: "Do not use JavaScript try/catch in application code. Model throwable
  synchronous operations with Effect.try and Promise failures with the
  appropriate Effect Promise adapter, then recover with Effect error-handling
  combinators such as catchTags. Handle Effect.try’s actual default error tag
  explicitly: UnknownError in stable Effect 4.0 (rather than the older
  UnknownException name). In React, put such actions in Atom.fn backed by a
  named Effect.fn, not inline component handlers or Atom.fnSync. Preserve
  intentional fallback behavior and let unhandled operational errors propagate."
purpose: Keep throwable failures in composable Effect error channels with
  explicit recovery and propagation.
---
```diff
-try { return JSON.parse(text) } catch { return fallback }
+return yield* Effect.try(() => JSON.parse(text)).pipe(Effect.catchTags({ UnknownError: () => Effect.succeed(fallback) }))
```
