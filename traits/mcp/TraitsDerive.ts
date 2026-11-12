import { Effect, pipe, Schema as S, String } from "effect"
import { Tool, Toolkit } from "effect/ai"

import { Trait } from "../Trait.ts"

/** Proposes one or more traits distilled from user feedback with insights that generalize beyond the current task. */
export const TraitsDerive = Tool.make("traits.derive", {
  description: pipe(
    String.stripMargin(`
  |Call this whenever the user gives feedback that may contain a generalizable insight: a correction, a stated preference, an approved or rejected approach, or a request to remember a convention.
  |Distill each independent insight into its own complete trait, so one piece of feedback may yield several traits. Skip one-off decisions, transient facts, and preferences specific to the current task.
  |Each trait needs a descriptive kebab-case name, the assertion that should hold, and its purpose; add a subject when the trait applies only to a kind of artifact, and a body for supporting examples or context, not hidden requirements.
  |Proposals are validated but not saved yet; do not tell the user a trait was stored.
  `),
    String.trim
  ),
  parameters: S.Struct({
    /** Complete trait proposals, one per independent generalizable insight. */
    traits: S.NonEmptyArray(Trait).annotate({
      description: "Complete trait proposals, one per independent generalizable insight."
    })
  }),
  success: S.Struct({
    /** The validated proposals; derivation and persistence are not implemented yet, so nothing was saved. */
    received: S.NonEmptyArray(Trait).annotate({
      description: "The validated proposals; derivation and persistence are not implemented yet, so nothing was saved."
    })
  })
})
  .annotate(Tool.Title, "Derive Traits")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)

/** The traits MCP toolkit. */
export const toolkit = Toolkit.make(TraitsDerive)

/** Handlers for the traits MCP toolkit; derivation is scaffolded and currently returns the validated proposals. */
export const layer = toolkit.toLayer({
  "traits.derive": (parameters) => Effect.succeed({ received: parameters.traits })
})
