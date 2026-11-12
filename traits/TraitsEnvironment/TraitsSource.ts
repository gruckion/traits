import { Schema as S } from "effect"

/** A named environment in another trait collection. */
export type TraitsSource = typeof TraitsSource.Type
export const TraitsSource = S.Struct({
  /** A collection reference interpreted by the resolver, such as github:example/effect-traits. */
  collection: S.NonEmptyString.check(S.isTrimmed()).annotateKey({
    description: "A collection reference interpreted by the resolver, such as github:example/effect-traits."
  }),
  /** The optional environment to resolve within the collection; omission indicates the default environment. */
  environment: S.NonEmptyString.check(S.isTrimmed())
    .annotateKey({
      description:
        "The optional environment to resolve within the collection; omission indicates the default environment."
    })
    .pipe(S.optionalKey)
}).annotate({
  description: "A named environment in another trait collection."
})
