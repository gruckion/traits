import { Schema as S } from "effect"

/** A policy-derived result: Fail found a violation, Incomplete could not finish required work, Inconclusive lacked a confident assessment, and Pass satisfied the policy. */
export type Verdict = typeof Verdict.Type
export const Verdict = S.Literals(["Pass", "Fail", "Inconclusive", "Incomplete"]).annotate({
  description:
    "A policy-derived result: Fail found a violation, Incomplete could not finish required work, Inconclusive lacked a confident assessment, and Pass satisfied the policy."
})
