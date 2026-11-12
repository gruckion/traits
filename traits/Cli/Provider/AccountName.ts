import { Schema as S } from "effect"

/** A saved account identifier starting with a lowercase letter or digit, followed by lowercase letters, digits, dots, underscores, or hyphens. */
export type AccountName = typeof AccountName.Type
export const AccountName = S.NonEmptyString.check(S.isPattern(/^[a-z0-9][a-z0-9._-]*$/u))
  .pipe(S.brand("traits/AccountName"))
  .annotate({
    description:
      "A saved account identifier starting with a lowercase letter or digit, followed by lowercase letters, digits, dots, underscores, or hyphens."
  })
