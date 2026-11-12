import { Effect, flow, Schema as S, String } from "effect"
import { DecisionModel, LanguageModel, Tool, Toolkit } from "effect/ai"

import * as ToolExecutionError from "../ToolExecutionError.ts"
import * as Trait from "../Trait.ts"
import * as Derivation from "../TraitDerivation.ts"
import { TraitsContext } from "../TraitsContext.ts"
import { TraitStore } from "../TraitStore.ts"

export const DeriveTrait = Tool.make("derive_trait", {
  description: String.stripMargin(`
  | Propose a durable, reusable preference after user feedback or an explicit request to remember a convention. Follow the server's trait-authoring and approval workflow; skip one-off decisions and clearly covered preferences.
  | Supply a complete proposedTrait. For clarification, preserve the existing name and submit the complete replacement, including context: omitted optional fields are removed. Do not supply a clarification target or delete a trait to resolve a clarification.
  | Call first with approved unset. Only on ApprovalRequired, present the full returned message through an interactive Save/Revise/Skip question. Retry the identical proposal with approved: true only after approval of that exact proposal and displayed action, including affected originals/removals. Code-edit approval is not permission to save a trait. Changed wording or actions require fresh approval; native forms may still apply.
  | Every success response is a tagged outcome: Created/Updated/Resolved means saved; inspect returned traits and check task files with those names. Do not resubmit a saved proposal. Covered means reuse the verified existing traits. Clarification means multiple candidates need a refined proposal or user clarification; nothing was written. Inconclusive blocks writes: inspect finding.reason (conflict, coverage_gap, or inconclusive) and resolve ambiguity before retrying.
  | RevisionRequired means revise and obtain fresh approval; ask what to change if feedback is absent. Declined means stop. Keep pending revisions across related follow-ups unless cancelled.
  `),
  parameters: S.Struct({
    proposedTrait: Trait.Trait.annotate({
      description:
        "Complete proposed trait. Clarifications replace the existing body/context while preserving its name; omitted optional fields are removed."
    }),
    approved: S.Boolean.pipe(S.optional).annotate({
      description:
        "Fallback approval for the exact proposal and automatically selected action shown to the user, including any existing trait being updated. Set true only after approval; native clients still receive a form. Does not bypass relationship checks."
    })
  }),
  success: Derivation.TraitDerivation,
  failure: ToolExecutionError.ToolExecutionError,
  failureMode: "return",
  dependencies: [DecisionModel.DecisionModel, LanguageModel.LanguageModel, TraitsContext, TraitStore]
})
  .annotate(Tool.Title, "Derive Trait")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)

export const toolkit = Toolkit.make(DeriveTrait)

export const layer = toolkit.toLayer({
  derive_trait: flow(
    Derivation.derive,
    Effect.catchCause(ToolExecutionError.fromCause),
    Effect.withSpan("DeriveTrait.derive", { root: true })
  )
})
