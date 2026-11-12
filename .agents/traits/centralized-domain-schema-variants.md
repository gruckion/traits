---
name: centralized-domain-schema-variants
subject: Domain models with multiple related boundary shapes. Excludes the
  members of a single union schema that encode which fields may be present
  (see unions-for-field-presence-constraints); those form one contract, not
  multiple boundary shapes.
assertion: When a domain model needs multiple related boundary shapes, declare
  shared fields and per-variant availability or encoding policies once with
  Effect VariantSchema, or Model when its standard variants fit. Expose named
  schemas from the domain module and reuse them instead of repeatedly spreading,
  picking, or omitting schema fields at call sites. Introduce variants only for
  genuinely different existing contracts, not speculative insert/update shapes.
purpose: Prevent related boundary schemas from drifting apart as shared domain
  fields evolve.
---
```diff
-const Stored = S.Struct({ name: S.String, body: S.String })
-const Header = S.Struct({ name: S.String })
+const fields = variants.Struct({ name: S.String, body: pipe(S.String, variants.FieldOnly(["stored"])) })
+const Stored = variants.extract(fields, "stored")
+const Header = variants.extract(fields, "header")
```

Out of scope: one contract written as a union of field-presence combinations.

```ts
export const ChangeIdentity = S.Union([
  S.Struct({ before: SourceIdentity, after: SourceIdentity.pipe(S.optionalKey) }),
  S.Struct({ before: SourceIdentity.pipe(S.optionalKey), after: SourceIdentity })
])
```
