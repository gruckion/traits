---
name: type-alias-before-schema
subject: Static type aliases extracted from Effect schemas. In TypeScript or TSX files.
assertion: "When extracting a schema’s static type, place the type alias
  immediately above the schema definition: `export type User = typeof User.Type`
  directly before `export const User = S.Struct({ id: S.String })`, not after
  it."
purpose: Make a schema's static type immediately discoverable beside its runtime
  definition.
---
```diff
-export const User = S.Struct({ id: S.String })
 export type User = typeof User.Type
+export const User = S.Struct({ id: S.String })
```

Correct: the TSDoc block above the alias belongs to the alias/schema pair, and the alias sits directly above its schema.

```ts
/** A user account. */
export type User = typeof User.Type
export const User = S.Struct({ id: S.String })
```

Out of scope: schema classes (`S.TaggedError`, `S.Class`) and helper schemas without an extracted alias; they need no alias and their position is not assessed.

```ts
export class UserError extends S.TaggedError<UserError>()("UserError", { id: S.String }) {}
const Id = S.NonEmptyString.check(S.isTrimmed())
```

Violation: the alias placed after its schema, or separated from it by other declarations.

```ts
export const User = S.Struct({ id: S.String })
export const helper = () => {}
export type User = typeof User.Type
```
