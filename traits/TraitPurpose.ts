import { Schema as S } from "effect"

/** What the trait aims to achieve or protect, and why that matters. */
export type TraitPurpose = typeof TraitPurpose.Type
export const TraitPurpose = S.NonEmptyString.check(S.isPattern(/\S/u), S.isMaxLength(2_000))
  .pipe(S.brand("traits/TraitPurpose"))
  .annotate({
    description: "What the trait aims to achieve or protect, and why that matters."
  })
