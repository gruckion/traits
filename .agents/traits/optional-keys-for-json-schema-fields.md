---
name: optional-keys-for-json-schema-fields
subject: Optional fields in Effect schemas.
assertion: Use S.optionalKey for every optional schema field by default, so the
  key may be omitted but explicit undefined is not admitted. Use S.optional only
  where explicit undefined must be admitted, with a comment at the field saying
  why. An S.optional field without such a comment is a violation.
purpose: Preserve the distinction between omitted keys and undefined values so
  schemas stay JSON-compatible by default and undefined is admitted only
  deliberately.
---
```ts
body: TraitBody.pipe(S.optionalKey)
```

Violation: `S.optional` with no comment justifying explicit undefined.

```ts
cause: S.optional(S.Defect())
```

Correct: either `cause: S.Defect().pipe(S.optionalKey)`, or a justified exception:

```ts
// Admits explicit undefined: callers forward `options.cause`, which may be undefined.
cause: S.optional(S.Defect())
```
