---
name: unions-for-field-presence-constraints
subject: "Effect Schema definitions whose valid shapes depend on which fields
  are present. Filters remain appropriate for constraints that structure cannot
  express: relationships between field values (range ordering, index bounds into
  a sibling array, length checks) or validation against external data. This rule
  covers presence constraints only."
assertion: When a schema's validity depends only on which fields are present (at
  least one of several, exactly one, or a field allowed or required only
  alongside another), model each valid combination as a member of an S.Union of
  structs rather than declaring all fields optional and enforcing the
  combination with S.makeFilter or another refinement. Mark each field as
  required or optional per member so every member's type admits only valid
  shapes. Use a tagged union when members are mutually exclusive and consumers
  need to branch on the case; keep the union untagged when overlapping members
  reflect real overlap, such as both sides of a rename.
purpose: Keep shape constraints visible in decoded types, exported JSON Schema,
  and documentation instead of hiding them in runtime-only refinements.
---
```diff
-export const ChangePaths = S.Struct({
-  before: S.NonEmptyString.pipe(S.optionalKey),
-  after: S.NonEmptyString.pipe(S.optionalKey)
-}).check(S.makeFilter((paths) => paths.before !== undefined || paths.after !== undefined))
+export const ChangePaths = S.Union([
+  S.Struct({ before: S.NonEmptyString, after: S.NonEmptyString.pipe(S.optionalKey) }),
+  S.Struct({ before: S.NonEmptyString.pipe(S.optionalKey), after: S.NonEmptyString })
+])
```

A filter that checks `input.change` against a sibling `changes` array is a
cross-value constraint and should stay a filter.
