---
name: unicode-patterns-for-json-schema-export
subject: Effect Schema isPattern regular expressions used in schemas exported to
  JSON Schema.
assertion: Use Unicode-mode regular expressions with the u flag for
  Schema.isPattern constraints that must survive JSON Schema export. Verify that
  generated JSON Schema retains the intended pattern constraints. When adding u
  would change intended matching semantics or make a pattern invalid, adapt the
  pattern or choose an explicitly supported representation rather than silently
  dropping the constraint.
purpose: Keep runtime validation and exported JSON Schema constraints aligned
  for structured output and API consumers.
---
In the installed Effect 4.1.0, Schema.String.check(Schema.isPattern(/\S/)) exports without a pattern, while /\S/u retains it. NonEmptyString alone still accepts whitespace-only strings. The same issue affected a kebab-case trait-name regex. Check generated patterns as well as representative accepted and rejected values; do not assume runtime validation proves export fidelity.