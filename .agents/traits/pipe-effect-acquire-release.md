---
name: pipe-effect-acquire-release
subject: Composition of Effect.acquireRelease with its acquisition effect.
assertion: Prefer piping the acquisition effect into Effect.acquireRelease
  rather than passing it as a nested first argument. Use a native curried
  overload when available; otherwise use an inline adapter such as
  acquire.pipe((effect) => Effect.acquireRelease(effect, release)). Keep
  release-only error handling on the release effect so the refactor does not
  change acquisition error semantics.
purpose: Keep acquisition and resource-lifecycle transformations readable in
  forward execution order without changing error behavior.
---
```ts
const file = yield* Effect.tryPromise({ try: openFile, catch: mapOpenError }).pipe(
  (acquire) => Effect.acquireRelease(
    acquire,
    (file) => Effect.promise(() => file.close()).pipe(Effect.orDie)
  )
)
```