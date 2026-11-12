---
name: inline-single-use-schema-and-decision-definitions
subject: "Single-use schemas, transcoders, and lightweight Decision.make
  definitions. In TypeScript or TSX files. Exception: When extracting a schema,
  transcoder, or Decision.make definition is needed for readability or justified
  by profiled construction overhead."
assertion: "Prefer inlining single-use schemas, schema transcoder definitions,
  and lightweight Decision.make definitions at their call sites instead of
  adding separate constants and names: DecisionModel.decide(Decision.make({
  input: S.Struct({ text: S.String }), decisions: { ... } }), options). Extract
  definitions when reused, when needed for readability, or when profiling shows
  meaningful construction overhead."
purpose: Keep lightweight definitions near their use and avoid names that add
  navigation without a meaningful boundary.
---
```diff
-const inputSchema = S.Struct({ text: S.String }) // Used once, no meaningful boundary.
-const input = yield* pipe(value, S.decodeUnknownEffect(inputSchema))
+const input = yield* pipe(value, S.decodeUnknownEffect(S.Struct({ text: S.String })))
```

Not single-use: a field schema shared by several members of one union, such as `const module = WorkspacePath.annotateKey({ description })` used in every case of a `S.TaggedUnion`.
