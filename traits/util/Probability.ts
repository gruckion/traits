import { Schema as S } from "effect"

/** A finite probability between zero and one, inclusive. */
export type Probability = typeof Probability.Type
export const Probability = S.Finite.check(S.isBetween({ minimum: 0, maximum: 1 })).annotate({
  description: "A finite probability between zero and one, inclusive."
})
