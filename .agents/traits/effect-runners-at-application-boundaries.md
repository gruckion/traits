---
name: effect-runners-at-application-boundaries
subject: Effect command handlers and application runtime execution.
assertion: Keep command handlers composable by returning their Effects. Run the
  application runtime at its entrypoint rather than wrapping a runtime runner
  such as NodeRuntime.runMain in Effect.sync inside a handler.
purpose: Preserve structured lifecycle ownership, interruption, and error propagation.
---
