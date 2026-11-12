---
name: direct-property-access-in-parameters
subject: Function, callback, and generator parameters receiving objects. In
  TypeScript, TSX, JavaScript, or JSX files.
assertion: "Use direct property access rather than object destructuring in
  function parameters, including arrow callbacks, ordinary functions, and
  generator/Effect handlers: `(v) => v.id`, not `({ id }) => id`; `function*
  (params) { yield* check(params.files) }`, not `function* ({ files }) { yield*
  check(files) }`. This applies regardless of the function body's complexity,
  not only to property selectors. Local destructuring inside a function body is
  unaffected."
purpose: Keep parameter identity and property provenance visible throughout
  function bodies.
---
```diff
-const names = Array.map(items, ({ name }) => name)
+const names = Array.map(items, (item) => item.name)
```
