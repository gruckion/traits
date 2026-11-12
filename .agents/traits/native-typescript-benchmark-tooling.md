---
name: native-typescript-benchmark-tooling
subject: Project-owned benchmark tooling and its command-line entry points.
  Projects that already have a project task CLI and support running TypeScript
  directly in Node.
assertion: Write benchmark tooling in TypeScript runnable directly by the
  supported Node runtime, and register user-facing benchmark commands as
  commands or subcommands of the existing project task CLI, using an
  intermediate benchmark command group when appropriate. Keep isolated worker
  processes where needed for valid measurements.
purpose: Keep benchmarks type-checked and discoverable alongside other project
  tasks without requiring a separate compilation step.
---
