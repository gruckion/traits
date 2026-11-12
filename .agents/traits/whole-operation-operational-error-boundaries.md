---
name: whole-operation-operational-error-boundaries
subject: Effect operations whose error is documented or evidently intended to
  represent all failures of the operation (or of each documented unit, such as
  one requested input). Does not apply to errors that only represent a
  validation rejection, and does not require introducing a wrapper where
  existing errors suffice.
assertion: Translate every recoverable failure belonging to the operation (or
  unit), including encoding and filesystem failures, into the error intended to
  represent it, preserving actionable context and the original cause where
  safe. Place the translation around the whole operation or unit rather than
  only its final step, while leaving caller-owned operation errors outside
  unrelated wrappers and preserving genuine internal invariant violations as
  defects. A composite operation need not use one error for the whole; each
  documented unit may own its error. Only under this condition does this trait
  take precedence over preserve-built-in-effect-errors.
purpose: Give callers a consistent recoverable error contract across every
  operational stage without obscuring unrelated failures.
---
The boundary covers failures belonging to the operation, not every failure from arbitrary caller-supplied work.

Violation: `LoadError` is documented as "any failure loading a config", but only parsing is translated; the read's `PlatformError` escapes.

```ts
/** Fails with LoadError on any failure loading the config. */
const load = (path: string) =>
  fs.readFileString(path).pipe(
    Effect.flatMap((text) => S.decodeEffect(ConfigJson)(text).pipe(Effect.mapError((cause) => LoadError.make({ path, cause })))),
  )
```

Not in scope: an `InsecureFileError` raised via `Effect.filterOrFail` only when a permissions check rejects a file, while `stat` failures propagate as `PlatformError`. That error represents a validation rejection, not every failure of the operation.
