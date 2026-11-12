---
name: schema-parsers-for-structured-documents
subject: Parsing of structured domain documents.
assertion: Prefer Effect Schema parsers for structured domain documents when
  their string segments can be modeled declaratively. Decode typed segments with
  S.decode* (the Effect variant, or the Option/Result variants when a failed
  decode is an ordinary non-match rather than an error) rather than manually
  matching regex captures, checking match positions, and slicing strings. Preserve document boundaries, untouched
  content, and meaningful domain-error mappings.
purpose: Make document structure declarative and validated while preserving
  boundaries and meaningful diagnostics.
---
```diff
-const parts = /^name:(.*)$/.exec(text)
-const name = parts?.[1]
+const [, name] = yield* pipe(text, S.decodeEffect(S.String.pipe(S.decodeTo(S.TemplateLiteralParser(["name:", S.String])))))
```

When a non-matching line is an ordinary outcome rather than an error, use an Option or Result variant:

```ts
const heading = pipe(line, S.decodeOption(Heading)) // Option.none() for ordinary lines
```
