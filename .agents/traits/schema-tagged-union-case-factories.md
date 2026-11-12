---
name: schema-tagged-union-case-factories
subject: Construction of decoded (Type-side) values of Effect Schema tagged-union
  members, including expected decoded values in test assertions. Excludes
  encoded representations (e.g. values typed as Union.Encoded or returned from
  schema transformation decode functions) and inputs passed to
  S.decode*/S.is/S.validate*, including deliberately invalid fixtures and
  objects whose tag is chosen at runtime for decoding. In TypeScript or TSX
  files.
assertion: 'Construct decoded instances of Effect Schema tagged unions with their
  case-specific factories, not manually tagged object literals:
  Union.cases.Fail.make({ reason }), not { _tag: "Fail", reason }. This applies
  to values used as the decoded type, such as results returned from domain
  code and expected values compared in test assertions.'
purpose: Keep tagged-union construction aligned with the schema's case
  definitions and validation behavior.
---
```diff
-const outcome = { _tag: "Fail", reason }
+const outcome = Outcome.cases.Fail.make({ reason })
```

In scope (violation): an expected decoded value in a test assertion.

```diff
-expect(Report.problems(report)).toEqual([{ _tag: "Enrichment", trait: 0, module }])
+expect(Report.problems(report)).toEqual([Report.Problem.cases.Enrichment.make({ trait: 0, module })])
```

Out of scope: the Encoded side returned from a schema transformation.

```ts
decode: (text): typeof ModelSelection.Encoded => ({ _tag: "Custom", path: text })
```

Out of scope: decoder or validator inputs, including deliberately invalid fixtures.

```ts
expect(S.is(Report.Report)(reportWith({ _tag: "NotSegmented" }, trait))).toBe(false)
const report = yield* decode({ ...base, changes: [{ _tag: "Ignored", reason: "Generated." }] })
```

Out of scope: an object whose tag is chosen at runtime and then decoded.

```ts
pipe({ _tag: segment._tag, change, segment }, S.decodeUnknownEffect(Input))
```
