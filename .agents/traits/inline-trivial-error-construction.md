---
name: inline-trivial-error-construction
subject: Error-construction callbacks and helpers used at catch, mapError,
  fail, and similar failure-handling sites. Applies even when naming a
  constructor-forwarding helper would improve readability.
assertion: Construct one-expression errors directly at the callback or failure
  site instead of extracting a helper whose only behavior is forwarding a cause
  or other arguments, possibly with captured fixed fields, into an error
  constructor, even when the expression repeats. Retain helpers that implement
  meaningful validation, recovery, shared policy, or a domain/API boundary
  beyond constructor forwarding.
purpose: Keep error construction visible where the failure is handled without
  trivial helper indirection.
---
```diff
-const failure = (cause: unknown) => LockError.make({ cause })
-effect.pipe(Effect.mapError(failure))
+effect.pipe(Effect.mapError((cause) => LockError.make({ cause })))
```

Helpers that capture fixed fields are still only forwarding:

```diff
-const fail = (problem: string) => FileError.make({ path, problem })
-if (!stat.isFile) return yield* fail("not a regular file")
+if (!stat.isFile) return yield* FileError.make({ path, problem: "not a regular file" })
```
