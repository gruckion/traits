---
name: infer-atom-handler-parameters
subject: Effect.fn handlers passed to Atom.fn.
assertion: When passing an Effect.fn handler to Atom.fn, let the outer Atom.fn
  contextually infer the handler parameters rather than explicitly annotating
  them, especially with unknown for an unused input. Keep positional
  placeholders only when needed to access later parameters.
purpose: Preserve the outer atom API's contextual typing and avoid annotations
  that obscure useful inferred types.
---
```diff
-const action = Atom.fn(Effect.fn("action")(function* (_: unknown, context: Atom.FnContext) { /* ... */ }))
+const action = Atom.fn(Effect.fn("action")(function* (_, context) { /* ... */ }))
```
