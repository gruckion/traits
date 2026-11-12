import { Schema as S } from "effect"

import { TraitName } from "../TraitName.ts"
import { TraitSources } from "./TraitSources.ts"

/** An additive selection of local traits and extended collection environments. */
export type TraitsEnvironment = typeof TraitsEnvironment.Type
export const TraitsEnvironment = S.Struct({
  /** Distinct environments to compose additively; omitted environment names are equivalent to default. */
  extends: TraitSources.pipe(S.optionalKey),
  /** Distinct trait names to assess; an empty list selects no traits. */
  traits: S.Array(TraitName).check(S.isUnique()).annotateKey({
    description: "Distinct trait names to assess; an empty list selects no traits."
  })
}).annotate({
  description: "An additive selection of local traits and extended collection environments."
})

export * from "./EnvironmentInfo.ts"
export * from "./TraitsEnvironmentStore.ts"
export * from "./TraitsSource.ts"
export * from "./TraitSources.ts"
