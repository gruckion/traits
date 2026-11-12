---
name: reuse-named-domain-field-types
subject: Model field types and schemas with existing dedicated domain types. In
  TypeScript or TSX files.
assertion: 'When an existing named domain type represents a model field,
  reference that type directly rather than extracting it with indexed access:
  TraitName instead of Trait["name"]. Reuse its schema value for decoding as
  well. Keep indexed access when no suitable named domain type exists.'
purpose: Preserve domain meaning and reuse existing validation contracts instead
  of coupling field types to record structure.
---
```diff
-const get = (name: Trait["name"]) => store.get(name)
+const get = (name: TraitName) => store.get(name)
```
