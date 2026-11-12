---
name: direct-effect-promise-adapters
subject: Adapters from Promise-returning operations to Effect. In TypeScript or
  TSX files.
assertion: "Use `Effect.promise` directly at Promise boundaries instead of
  introducing generic wrapper helpers: `Effect.promise(() => client.run())`, not
  `fromPromise(() => client.run())` where `fromPromise` merely wraps
  `Effect.promise`."
purpose: Make asynchronous boundaries explicit without wrappers that add
  indirection but no behavior.
---
```diff
-const result = fromPromise(() => client.run()) // Helper only wraps Effect.promise.
+const result = Effect.promise(() => client.run())
```
