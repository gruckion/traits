---
name: wildcard-reexports-in-subsystem-barrels
subject: TypeScript subsystem barrel modules intended to expose their
  constituent modules' complete public APIs.
assertion: Use export * from declarations for constituent modules rather than
  enumerating individual symbols. Preserve intentionally selective exports when
  a barrel is meant to restrict its API, and resolve name collisions explicitly
  rather than introducing ambiguous wildcard exports.
purpose: Keep complete subsystem APIs discoverable without maintaining redundant
  symbol lists.
---
```ts
export * from "./TraitEnrichment.ts"
export * from "./TraitEnrichmentContext.ts"
```