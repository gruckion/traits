---
name: document-schema-inferred-type-aliases
subject: Exported TypeScript type aliases inferred from schemas.
assertion: Provide concise, accurate JSDoc immediately above each exported
  schema-inferred type alias. Place documentation describing the modeled value
  on the type alias rather than only on the schema constant; retain field-level
  comments and runtime schema descriptions where relevant.
purpose: Make domain meaning visible when consumers inspect or import the inferred type.
---
```ts
/** A finite probability between zero and one, inclusive. */
export type Probability = typeof Probability.Type
export const Probability = S.Finite.check(S.isBetween({ minimum: 0, maximum: 1 }))
```