---
name: colocate-small-domain-errors
subject: Modules that declare (define the class or schema of) small
  domain-specific error types. Barrels and other modules that merely re-export,
  import, or reference errors declared elsewhere are out of scope.
assertion: Define small domain-specific error types alongside the domain
  operations that produce them rather than creating standalone error modules,
  unless separate ownership or dependency constraints justify a separate module.
purpose: Keep small error definitions close to their meaning and avoid
  unnecessary module fragmentation.
---
```diff
-// Parse.ts
-import { InvalidDocument } from "./InvalidDocument.ts"
+// Parse.ts: the small error belongs to this operation.
+export class InvalidDocument extends S.TaggedError<InvalidDocument>()("InvalidDocument", { path: S.String }) {}
```

Violation: `InvalidDocument.ts` contains only `export class InvalidDocument extends S.TaggedError<...>` and is used solely by `Parse.ts`.

Out of scope: an `index.ts` barrel containing `export * from "./Parse.ts"` or `export { InvalidDocument } from "./Parse.ts"`; it declares no error.
