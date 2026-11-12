---
name: synchronize-schema-field-documentation
subject: TSDoc comments and runtime description annotations on schema fields.
assertion: Keep each schema field’s TSDoc comment and runtime description
  annotation synchronized. Use matching wording for the same field semantics,
  including constraints, optionality, reference targets, and interactions;
  update both when those semantics change. When a field inherits a description
  from a reusable schema, align its comment with that description or provide a
  field-specific description matching its contextual meaning.
purpose: Ensure developers reading source and consumers reading generated
  schemas receive consistent field documentation.
---
For Effect schemas, descriptions may be supplied through .annotate({ description }) or .annotateKey({ description }).

```ts
/** Inclusive starting offset in zero-based UTF-16 code units. */
start: S.Natural.annotate({
  description: "Inclusive starting offset in zero-based UTF-16 code units."
})
```

When a field reuses an imported schema without a field-level description, its TSDoc is assumed to mirror that schema's own description, which is not visible in the file; flag only an in-file description that disagrees with the field's TSDoc.
