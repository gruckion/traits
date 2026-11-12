---
name: test-model-behavior-with-real-integrations
subject: Tests whose assertions depend on a model's judgment or output quality
  (classification correctness, generated content), whether the model is real or
  mocked, as opposed to tests of how code builds model requests or handles
  model responses.
assertion: Test model-dependent behavior with real-model integration tests using
  meaningful inputs and expected outcomes, rather than mocked model answers that
  predetermine the behavior under test. Use mocks only when they help validate
  important independent deterministic behavior, such as utility logic, protocol
  handling, or failure handling; do not treat mock-driven outcomes as evidence
  of model quality.
purpose: Obtain evidence of actual model behavior rather than mistaking
  predetermined mock answers for model quality.
---
Allowed: a mocked model returning a fixed answer to test request plumbing (batching, request shape, missing-answer normalization, error propagation).

```ts
it.effect("splits assertions into batches and fills missing answers", () =>
  Effect.gen(function*() {
    const model = mockModel(() => ({ a: "pass" })) // omits "b"
    const result = yield* assess(["a", "b"]).pipe(Effect.provide(model))
    expect(model.requests).toHaveLength(1)
    expect(result.b._tag).toBe("Missing")
  }))
```

Violation (in scope even though the model is mocked): a mocked model returning "fail" for a known-bad input, then asserting the checker detects the violation; the mock predetermines the outcome.

```ts
it.effect("detects a violation", () =>
  Effect.gen(function*() {
    const model = mockModel(() => ({ a: "fail" }))
    const result = yield* check(knownBadFile).pipe(Effect.provide(model))
    expect(result.a.fail).toBe(true)
  }))
```
