import { Cause, Effect, Schema as S } from "effect"

export class ToolExecutionError extends S.TaggedError<ToolExecutionError>()("ToolExecutionError", {
  details: S.String
}) {
  override get message() {
    return "Tool execution failed. Report the diagnostics to the user; do not treat this as a successful operation. Inspect stored traits before retrying a failed mutation."
  }
}

export const fromCause = (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause) ? Effect.interrupt : ToolExecutionError.make({ details: Cause.pretty(cause) })
