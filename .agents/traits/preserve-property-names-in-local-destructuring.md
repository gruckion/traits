---
name: preserve-property-names-in-local-destructuring
subject: Object properties extracted into local bindings for repeated use. In
  TypeScript, TSX, JavaScript, and JSX.
assertion: "For ordinary data properties, use local object destructuring with
  the existing property name instead of a differently named alias: const {
  proposedTrait } = params, not const proposed = params.proposedTrait. Reference
  proposedTrait afterward. Do not apply this mechanically to built-in or
  platform APIs: for browser DOM access such as document.documentElement, retain
  qualified access or an intentional alias. For getters, live properties, and
  receiver-sensitive members, preserve access timing, repeated reads, and
  receiver binding rather than destructuring when it would change behavior or
  obscure API semantics. This concerns local bindings, not function-parameter
  destructuring, and does not prohibit meaningful names for transformed
  results."
purpose: Reduce redundant naming for ordinary data while preserving the
  semantics and clarity of native APIs and accessors.
---
```diff
-const proposed = params.proposedTrait
-const text = Trait.serialize(proposed)
+const { proposedTrait } = params
+const text = Trait.serialize(proposedTrait)
```

Not an alias: a binding for a transformed value, such as `const flagged = Option.getOrUndefined(params.from)`, which names the result of a transformation rather than renaming the property.
