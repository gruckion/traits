---
name: domain-types-for-complete-record-storage
subject: Storage operations creating or replacing complete domain records.
  Applies when designing or implementing storage operations that create or
  replace complete domain records. In TypeScript or TSX files.
assertion: For storage operations that create or replace complete domain
  records, accept the existing domain type instead of separate per-field
  parameters or a manually duplicated object type. Persist the complete record
  without dropping optional metadata or extension fields.
purpose: Prevent storage contracts from drifting from domain models or silently
  dropping record content.
---
```diff
-const add = (name: TraitName, body: string) => persist({ name, body })
+const add = (trait: Trait) => persist(trait)
```
