import { Cause, Effect, Layer, Schema as S, String } from "effect"
import { McpServer, Tool, Toolkit } from "effect/ai"

import { CheckTraits } from "./CheckTraits.ts"
import { DeriveTrait } from "./DeriveTrait.ts"

const toolkit = Toolkit.make(
  Tool.make("derive_trait", {
    description: DeriveTrait.description,
    parameters: DeriveTrait.parametersSchema,
    success: S.Never,
    failure: S.String,
    failureMode: "return"
  }).annotate(Tool.Readonly, true),
  Tool.make("check_traits", {
    description: CheckTraits.description,
    parameters: CheckTraits.parametersSchema,
    success: S.Never,
    failure: S.String,
    failureMode: "return"
  }).annotate(Tool.Readonly, true)
)

const derivationInstructions = String.stripMargin(`
|Surface this configuration failure to the user. Fix the reported error, then restart the Traits MCP server and retry the same trait derivation with the identical arguments. No trait was saved; keep the proposal pending until the error is resolved. Do not paste credentials into chat.
`)
const reviewInstructions = String.stripMargin(`
|Surface this configuration failure to the user. Fix the reported error, then restart the Traits MCP server and retry the same check. No trait review was performed. Do not paste credentials into chat.
`)

export const layer = (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause)
    ? Layer.effectDiscard(Effect.interrupt)
    : McpServer.toolkit(toolkit).pipe(
        Layer.provide(
          toolkit.toLayer({
            derive_trait: () =>
              Effect.fail(`${Cause.pretty(cause)}\n\n${String.trim(derivationInstructions)}`).pipe(
                Effect.withSpan("DeriveTrait.derive", { root: true })
              ),
            check_traits: () =>
              Effect.fail(`${Cause.pretty(cause)}\n\n${String.trim(reviewInstructions)}`).pipe(
                Effect.withSpan("CheckTraits.check", { root: true })
              )
          })
        )
      )
