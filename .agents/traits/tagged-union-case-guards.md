---
name: tagged-union-case-guards
subject: Case checks and filtering, including manual tag comparisons such as
  x._tag === "Fail", on values whose static type comes from an
  Effect Schema tagged union (S.TaggedUnion or S.toTaggedUnion) exposing
  .guards. Excludes plain-interface or library unions without guards (e.g.
  effect/ai Decision.Any) and reading or asserting the tag as data. In
  TypeScript or TSX files.
assertion: 'Use tagged unions’ built-in case guards when testing or filtering
  cases rather than manually comparing the tag:
  Array.filter(TraitExpression.guards.Fail), not Array.filter((value) =>
  value._tag === "Fail"). Reading or asserting the tag as data, such as
  expect(x._tag).toBe("Failed") or mapping tags to labels, is not a case test.'
purpose: Keep case detection aligned with union definitions and preserve useful
  type narrowing without manual tag checks.
---
```diff
-const failures = Array.filter(results, (result) => result._tag === "Fail")
+const failures = Array.filter(results, Outcome.guards.Fail)
```

Violation: a manual tag comparison on a schema tagged union (`Outcome = S.TaggedUnion({ ... })`).

```ts
if (outcome._tag === "Fail") { ... } // use Outcome.guards.Fail(outcome)
```

Not a violation: a plain-interface library union has no `.guards`.

```ts
// decision: Decision.Any from effect/ai, a TypeScript interface union
if (decision._tag === "Classify") { ... }
```

Not a violation: the tag read or asserted as data.

```ts
expect(result._tag).toBe("Failed")
const label = { Pass: "ok", Fail: "error" }[outcome._tag]
```
