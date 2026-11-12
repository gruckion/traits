import { Schema as S } from "effect"

/** A profile identifier starting with a lowercase letter or digit, followed by lowercase letters, digits, dots, underscores, or hyphens. */
export type ProfileName = typeof ProfileName.Type
export const ProfileName = S.NonEmptyString.check(S.isPattern(/^[a-z0-9][a-z0-9._-]*$/u))
  .pipe(S.brand("traits/ProfileName"))
  .annotate({
    description:
      "A profile identifier starting with a lowercase letter or digit, followed by lowercase letters, digits, dots, underscores, or hyphens."
  })
