---
name: operation-specific-service-error-channels
subject: Error types in explicit Effect service contracts.
assertion: Give each service operation an operation-specific error type rather
  than a generic service-wide error wrapper.
purpose: Let callers identify the failed operation and choose operation-specific
  recovery.
---
```diff
-readonly read: (name: string) => Effect.Effect<TraitsEnvironment, TraitsEnvironmentStoreError>
-readonly write: (name: string, environment: TraitsEnvironment) => Effect.Effect<void, TraitsEnvironmentStoreError>
+readonly read: (name: string) => Effect.Effect<TraitsEnvironment, TraitsEnvironmentReadError>
+readonly write: (name: string, environment: TraitsEnvironment) => Effect.Effect<void, TraitsEnvironmentWriteError>
```

Another example:

```ts
readonly read: (name: TraitName) => Effect.Effect<Trait, TraitReadError>
readonly write: (trait: Trait) => Effect.Effect<void, TraitWriteError>
```

Avoid giving both operations a generic `TraitsStoreError`.