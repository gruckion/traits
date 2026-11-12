---
name: inline-small-single-use-helpers
subject: Small single-use helpers, including React atom logic, other than
  trivial error-constructor forwarding helpers. Applies to TypeScript, TSX,
  JavaScript, and JSX.
assertion: Prefer inlining small single-use helper logic into the operation that
  consumes it instead of introducing a separately named helper. Extract a helper
  when reused, when naming materially improves readability, or when it defines a
  meaningful domain/API boundary. In React, inline into the relevant atom or
  Effect operation, not into component render or event handlers.
purpose: Keep local behavior easy to follow without unnecessary helper indirection.
---
For example, place theme initialization directly inside its atom definition.

```diff
-const getName = (item) => item.name // Trivial single-use helper.
-const names = Array.map(items, getName)
+const names = Array.map(items, (item) => item.name)
```