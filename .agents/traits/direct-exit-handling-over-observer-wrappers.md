---
name: direct-exit-handling-over-observer-wrappers
subject: Handling settled Effect outcomes and abstractions around result consumption.
assertion: When code needs an operation's Exit and then updates state or
  branches on it, obtain the Exit with Effect.exit and handle it directly. Do
  not introduce callback-based capture/observe wrappers or helper modules that
  merely invoke a callback with the same outcome. Retain onExit, finalizers, or
  specialized helpers when a concrete lifecycle requirement needs them, such as
  cleanup or recovery coordination that must run during interruption.
purpose: Keep outcome handling local and sequential without callback scaffolding
  or redundant abstractions.
---
Prefer const exit = yield* operation.pipe(Effect.exit), followed by the relevant branching or state updates, over capture(operation, (exit) => ...). Direct post-operation handling is not a replacement for finalizers that must execute during interruption.