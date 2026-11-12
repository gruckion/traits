---
name: keep-decoded-configuration-on-context
subject: Decoded configuration and derived runtime values exposed through an
  Effect context. In TypeScript or TSX files.
assertion: When an Effect context exposes decoded configuration, keep the
  configuration object on the context and read unchanged settings through it
  rather than copying individual settings into separate context fields. Keep
  derived runtime values, such as normalized paths and semaphores, as separate
  context fields.
purpose: Preserve a clear source of configuration truth and distinguish decoded
  settings from derived runtime state.
---
```diff
-return { concurrency: config.concurrency, semaphore }
+return { config, semaphore }
```
