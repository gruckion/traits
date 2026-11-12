---
name: separate-native-errors-from-wire-schemas
subject: Native error-channel types and simplified wire-response schemas for
  explicit Effect service contracts.
assertion: Keep native error-channel types distinct from simplified
  wire-response schemas. Type service operations with their actual domain or
  platform errors, retaining structured information needed for recovery.
  Translate errors into simplified transport representations at the transport
  boundary, not inside the service solely to satisfy a response schema.
purpose: Preserve native failure information and typed recovery for service
  callers while allowing transport responses to expose a deliberate,
  serializable subset.
---
Keep structured errors in the service; simplify them in the transport adapter. Reuse the native schema when it already matches the wire contract—no extra wrappers or duplicate schemas are needed.

```diff
-type WireError = { readonly code: string; readonly message: string }
 interface Store {
-  readonly read: (name: TraitName) => Effect.Effect<Trait, WireError>
+  readonly read: (name: TraitName) => Effect.Effect<Trait, TraitReadError>
 }
```
