---
name: tagged-enum-runtime-factories
subject: Effect Data.TaggedEnum type aliases. In TypeScript or TSX files.
assertion: "Every Effect Data.TaggedEnum type alias must be paired with a
  same-named runtime Data.taggedEnum factory, exposing both the type and value
  under one name: export type Outcome = Data.TaggedEnum<{ Pass: {}; Fail: {
  reason: string } }>; export const Outcome = Data.taggedEnum<Outcome>(). This
  applies to Data.TaggedEnum declarations, independently of Schema.TaggedUnion
  construction rules."
purpose: Provide consistent runtime construction and matching support alongside
  tagged-enum type declarations.
---
```diff
-type Outcome = Data.TaggedEnum<{ Pass: {}; Fail: { reason: string } }>
+type Outcome = Data.TaggedEnum<{ Pass: {}; Fail: { reason: string } }>
+const Outcome = Data.taggedEnum<Outcome>()
```
