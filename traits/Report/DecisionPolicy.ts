import { Schema as S } from "effect"

import { Probability } from "../util/util.ts"

/** Serializable assessment thresholds, so every environment derives the same verdicts from the same report. */
export type DecisionPolicy = typeof DecisionPolicy.Type
export const DecisionPolicy = S.Struct({
  /** Minimum fail probability rejecting an assessment; checked before acceptance. */
  fail: Probability.annotateKey({
    description: "Minimum fail probability rejecting an assessment; checked before acceptance."
  }),
  /** Minimum pass probability accepting an assessment. */
  pass: Probability.annotateKey({ description: "Minimum pass probability accepting an assessment." }),
  /** Minimum na probability accepting an assessment as not applicable; omitted when not-applicable never passes. */
  na: Probability.annotateKey({
    description:
      "Minimum na probability accepting an assessment as not applicable; omitted when not-applicable never passes."
  }).pipe(S.optionalKey)
}).annotate({
  description:
    "Serializable assessment thresholds, so every environment derives the same verdicts from the same report."
})
