---
name: shared-layers-at-program-boundaries
subject: "Shared Effect service layer provisioning and dependency scopes.
  Applies when providing shared Effect service layers or choosing dependency
  scopes. In TypeScript or TSX files. Exception: When every locally provided
  dependency under assessment has scope or configuration that genuinely belongs
  to that operation rather than being shared program-wide."
assertion: "Provide shared, program-wide Effect layers at the outermost program
  boundary, such as the CLI entry point: use
  `program.pipe(Effect.provide(Database.layer))` once rather than
  `query.pipe(Effect.provide(Database.layer))` per call. Inner modules and
  handlers should declare their service dependencies and let the outer layers
  satisfy them, rather than constructing shared layers locally or capturing and
  re-providing those services per call. Keep local provisioning for dependencies
  whose scope or configuration genuinely belongs to that operation."
purpose: Make dependency ownership and sharing explicit while avoiding repeated
  construction of program-wide services.
---
```diff
-const query = operation.pipe(Effect.provide(Database.layer))
-const program = query
+const query = operation
+const program = query.pipe(Effect.provide(Database.layer))
```
