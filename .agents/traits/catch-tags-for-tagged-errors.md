---
name: catch-tags-for-tagged-errors
subject: Tagged-error recovery in Effect programs. In TypeScript or TSX files.
assertion: 'Always prefer Effect.catchTags over Effect.catchTag for tagged-error
  recovery, including when handling only one error tag: Effect.catchTags({
  UnknownError: handler }), not Effect.catchTag("UnknownError", handler).
  Preserve the existing handlers and error propagation behavior.'
purpose: Keep tagged-error recovery consistent and make related handlers easy to
  extend together.
---
```diff
-Effect.catchTag("UnknownError", handler)
+Effect.catchTags({ UnknownError: handler })
```
