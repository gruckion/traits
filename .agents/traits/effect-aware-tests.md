---
name: effect-aware-tests
subject: Tests executing Effects or acquiring scoped resources. In TypeScript,
  TSX, JavaScript, or JSX files.
assertion: Use @effect/vitest wherever tests execute Effects, yielding Effects
  directly through its Effect-aware test APIs instead of manually calling
  Effect.runSync or Effect.runPromise in ordinary test callbacks. Use the
  installed version's scoped testing support for resource cleanup;
  @effect/vitest 4 provides Scope through it.effect itself. Keep ordinary test
  APIs for pure synchronous tests or framework-specific harnesses that do not
  execute Effects.
purpose: Keep Effect execution, failures, and resource cleanup under the test
  framework's lifecycle.
---
```diff
-it("loads", async () => { expect(await Effect.runPromise(load)).toBe("value") })
+it.effect("loads", Effect.fnUntraced(function* () { const value = yield* load; expect(value).toBe("value") }))
```
