---
name: native-promises-in-build-hooks
subject: Build-tool plugin hooks and framework callbacks.
assertion: "In build-tool configuration files such as vite.config.ts, write
  plugin hooks and other framework callbacks with plain async/await and
  Promises. Do not wrap them in Effect.gen or Effect.fn, or add Effect.withSpan,
  only to run them immediately with Effect.runPromise: the framework's Promise
  contract is the boundary and nothing collects those spans. Effect conventions,
  including spans, still apply to application and library code."
purpose: Match build-tool execution contracts directly without immediately
  running unnecessary Effect wrappers or unused spans.
---
```diff
-buildStart: () => Effect.promise(() => generate()).pipe(Effect.runPromise)
+buildStart: async () => { await generate() }
```
