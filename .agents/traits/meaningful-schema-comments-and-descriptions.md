---
name: meaningful-schema-comments-and-descriptions
subject: Domain schemas, their variants, and their fields.
assertion: Prefer meaningful TSDoc comments and runtime description annotations
  when defining or modifying schemas. Explain domain meaning, non-obvious
  constraints, units, optionality, reference targets, interactions, and security
  semantics where relevant rather than merely restating identifiers or primitive
  types. Document variants when their lifecycle or behavioral meaning benefits
  from explanation. Keep comments and runtime descriptions aligned, reuse
  suitable inherited descriptions, and use contextual field annotations instead
  of duplicating reusable schema documentation. Schema error classes
  (S.TaggedError, S.Class) are domain schemas in scope; their fields need TSDoc
  and descriptions where semantics are non-obvious, especially security
  semantics.
purpose: Make schema contracts understandable both in source code and to
  consumers of runtime or generated schema descriptions.
---
For example, document that expiresAt is an optional Unix epoch timestamp in milliseconds, whether a token is redacted only in memory, and which saved account a completion result references. In Effect Schema, use annotate for a schema's intrinsic meaning and annotateKey for contextual field descriptions.

Error classes are in scope:

```ts
export class UserFileSecurityError extends S.TaggedError<UserFileSecurityError>()("UserFileSecurityError", {
  /** Path that is group- or world-accessible, or not owned by the current user. */
  path: S.String.annotateKey({ description: "Path that is group- or world-accessible, or not owned by the current user." })
}) {}
```

Violation: an error class whose security-relevant field is undocumented, e.g. `path: S.String` with no TSDoc or description.
