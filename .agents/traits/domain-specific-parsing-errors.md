---
name: domain-specific-parsing-errors
subject: "Recoverable domain errors at parsing boundaries. Applies when defining
  recoverable custom domain errors or modeling parsing failures. In TypeScript
  or TSX files. Exception: When the parsing failure is already represented by
  SchemaError from input-schema validation."
assertion: At parsing boundaries with recoverable domain-specific failures, use
  schema-backed tagged errors rather than Effect.try's generic UnknownError.
  Give distinct custom domain failure situations separate tags instead of a
  catch-all error distinguished only by reason strings. Include only actionable
  client context, such as an affected ID, path, source position, or limit;
  preserve the original cause where available without copying full inputs or
  adding unrelated or redundant fields. Retain SchemaError for input-schema
  validation failures, unless its issues would retain sensitive input values;
  then map it to a tagged error carrying only non-sensitive context, such as
  the path, and document why the cause is dropped. Do not wrap unrelated built-in operational errors
  merely for consistency.
purpose: Give callers meaningful recovery choices and actionable diagnostics
  without losing the original failure cause.
---
```diff
-const parsed = Effect.try(() => parseDocument(text))
+const parsed = Effect.try({ try: () => parseDocument(text), catch: (cause) => InvalidDocument.make({ path, cause }) })
```

Not a violation: dropping a SchemaError whose issues would hold credentials.

```ts
// The schema cause is dropped so credential values are not retained.
S.decodeEffect(Accounts)(text).pipe(Effect.mapError(() => InvalidAccountsError.make({ path })))
```

Situations are distinct when callers would recover from them differently. Diagnostic variations of one remedy, such as the ways a document can be invalid when the fix is always to correct that file, may share one tag with an instance-specific problem field.
