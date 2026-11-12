import { Schema as S } from "effect"

import { Probability } from "../util/util.ts"

/** Assertion outcome probabilities; normalization is owned by the decision model, and consumers apply explicit decision policies. */
export type Assessment = typeof Assessment.Type
export const Assessment = S.Struct({
  /** Probability that the input satisfies the assertion. */
  pass: Probability.annotateKey({ description: "Probability that the input satisfies the assertion." }),
  /** Probability that the input violates the assertion. */
  fail: Probability.annotateKey({ description: "Probability that the input violates the assertion." }),
  /** Probability that the trait does not apply to the input. */
  na: Probability.annotateKey({ description: "Probability that the trait does not apply to the input." }),
  /** Probability that the available evidence is insufficient for assessment. */
  uncertain: Probability.annotateKey({
    description: "Probability that the available evidence is insufficient for assessment."
  })
}).annotate({
  description:
    "Assertion outcome probabilities; normalization is owned by the decision model, and consumers apply explicit decision policies."
})
