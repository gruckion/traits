---
name: effect-native-cancellation
subject: Cancellation and AbortSignal interoperability in Effect-based code.
assertion: Use Effect fiber interruption and scoped resource management for
  cancellation within Effect code, rather than introducing AbortController
  instances, incoming AbortSignal parameters, or manual abort-listener races for
  internal cancellation. When a non-Effect API requires an AbortSignal, obtain
  an Effect-managed signal with yield* Effect.abortSignal and pass it to that
  API. Adapt externally supplied signals only at a genuine non-Effect
  integration boundary, keeping internal operations Effect-native.
purpose: Preserve structured cancellation and resource cleanup without
  maintaining a parallel cancellation mechanism.
---
The installed Effect API is Effect.abortSignal, not Effect.signal. Its signal follows the owning scope's lifetime; provide a scope matching the external operation's lifetime.