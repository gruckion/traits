import { Schema as S } from "effect"

/** A descriptive kebab-case trait name starting with a letter, without a redundant trait- prefix. */
export type TraitName = typeof TraitName.Type
export const TraitName = S.NonEmptyString.check(
  S.isTrimmed(),
  S.isPattern(/^(?!trait-)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
  S.isMaxLength(200)
)
  .pipe(S.brand("traits/TraitName"))
  .annotate({
    description: "A descriptive kebab-case trait name starting with a letter, without a redundant trait- prefix."
  })
