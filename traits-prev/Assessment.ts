import { Schema as S } from "effect"

const Probability = S.Finite.check(S.isBetween({ minimum: 0, maximum: 1 }))

export type Assessment = typeof Assessment.Type
export const Assessment = S.Struct({
  classification: S.Literals(["compliant", "violation", "not-applicable", "inconclusive"]),
  probabilities: S.Struct({
    compliant: Probability,
    violation: Probability,
    "not-applicable": Probability,
    inconclusive: Probability
  })
})
