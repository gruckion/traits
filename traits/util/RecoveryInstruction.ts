import { Schema as S } from "effect"

/** Nonblank, actionable guidance for resolving a failure before reevaluation. */
export type RecoveryInstruction = typeof RecoveryInstruction.Type
export const RecoveryInstruction = S.NonEmptyString.check(S.isPattern(/\S/u)).annotate({
  description: "Nonblank, actionable guidance for resolving a failure before reevaluation."
})
