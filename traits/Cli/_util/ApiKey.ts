import { Config, Effect, flow, Option, Redacted, String } from "effect"
import { CliError, Prompt, TerminalCapabilities } from "effect/cli"

export const read = Effect.fn("ApiKey.read")(
  function* (keyEnv: Option.Option<string>, message: string) {
    const variable = Option.getOrUndefined(keyEnv)
    if (variable !== undefined) {
      return yield* Config.Redacted(variable).pipe(
        Effect.catchTags({
          ConfigError: () =>
            CliError.UserError.make({
              cause: `Could not read an API key from environment variable ${variable}. Set it to a nonblank API key and retry.`
            })
        })
      )
    }
    const { canPrompt } = yield* TerminalCapabilities.TerminalCapabilities
    if (!canPrompt) {
      return yield* CliError.UserError.make({
        cause: "Interactive API-key entry requires a terminal. Use --key-env <variable> in headless mode."
      })
    }
    return yield* Prompt.run(Prompt.Password({ message }))
  },
  Effect.filterOrFail(flow(Redacted.value, String.trim, String.isNonEmpty), () =>
    CliError.UserError.make({ cause: "An API key is required." })
  )
)
