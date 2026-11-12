---
name: effect-values-for-parameterless-operations
subject: Exported parameterless Effect operations. In TypeScript or TSX files.
assertion: For parameterless Effect operations, export an Effect value instead
  of a zero-argument Effect.fn or Effect.fnUntraced function. Use Effect.gen
  when sequencing effectful work, or reuse an existing Effect directly when no
  generator is needed. Consumers should yield the Effect directly rather than
  invoke it. Preserve tracing with Effect.withSpan when appropriate.
purpose: Expose parameterless effects directly without meaningless invocation
  wrappers or lost tracing.
---
```diff
-export const load = Effect.fn("load")(function* () { return yield* read.pipe(Effect.map(decode)) })
+export const load = read.pipe(Effect.map(decode), Effect.withSpan("load"))
```
