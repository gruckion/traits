---
name: minimal-high-value-tests-and-type-first-verification
subject: Test files and the verification steps chosen for a change.
assertion: Prioritize development velocity and strong static types. Keep only
  concise tests that protect important behavior types cannot establish; avoid
  repetitive assertions, redundant suites, and broad end-to-end workflow tests.
  For routine edits, prefer formatting, lint, and type checks and run only
  relevant tests when warranted. When model-dependent behavior materially needs
  verification, use a small, explicitly opt-in real-model check with meaningful
  inputs and expected outcomes. Use of mocks in model-related tests is governed
  by test-model-behavior-with-real-integrations.
purpose: Preserve development speed while concentrating verification on
  important risks that static types cannot establish.
---
Correct: a narrow process-level test of behavior observable only by spawning a process.

```ts
it.effect("exits with code 2 on an invalid trait file", () =>
  Effect.gen(function*() {
    const exitCode = yield* runCli(["check", "--trait", "broken"])
    expect(exitCode).toBe(2)
  }))
```

Violation: a multi-command workflow test with repetitive assertions.

```ts
it.effect("full workflow", () =>
  Effect.gen(function*() {
    expect((yield* runCli(["init"])).exitCode).toBe(0)
    expect((yield* runCli(["add", "a"])).exitCode).toBe(0)
    expect((yield* runCli(["add", "b"])).exitCode).toBe(0)
    expect((yield* runCli(["list"])).stdout).toContain("a")
    expect((yield* runCli(["list"])).stdout).toContain("b")
    expect((yield* runCli(["check"])).exitCode).toBe(0)
  }))
```

Several commands in one test are fine when each exercises the property named in the test title, and a table-driven loop asserting one property is concise rather than repetitive. A violation chains commands through a user journey with unrelated assertions at each step.
