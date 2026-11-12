import { Array, Effect, Schema as S } from "effect"
import { CliError } from "effect/cli"

import * as Accounts from "../Accounts.ts"
import { withLock } from "../UserConfigLock.ts"
import { AccountName } from "./AccountName.ts"
import { Credential } from "./Credential.ts"
import { ProviderId } from "./ProviderId.ts"

/** A saved provider connection; contains credentials and must not be stored in project configuration. */
export type ProviderAccount = typeof ProviderAccount.Type
export const ProviderAccount = S.Struct({
  /** Local account name used by saved model profiles. */
  id: AccountName.annotateKey({ description: "Local account name used by saved model profiles." }),
  /** Provider identity; cannot change when updating an existing account. */
  provider: ProviderId.annotateKey({
    description: "Provider identity; cannot change when updating an existing account."
  }),
  /** Trimmed, nonempty provider authentication method identifier. */
  method: S.NonEmptyString.check(S.isTrimmed()).annotateKey({
    description: "Trimmed, nonempty provider authentication method identifier."
  }),
  /** Optional trimmed, nonempty display label for this account. */
  label: S.NonEmptyString.check(S.isTrimmed())
    .annotateKey({ description: "Optional trimmed, nonempty display label for this account." })
    .pipe(S.optionalKey),
  /** Optional provider connection settings; values are not redacted. */
  settings: S.Record(S.String, S.String)
    .annotateKey({ description: "Optional provider connection settings; values are not redacted." })
    .pipe(S.optionalKey),
  credential: Credential
}).annotate({
  description: "A saved provider connection; contains credentials and must not be stored in project configuration."
})

export const save = Effect.fn("ProviderAccount.save")(function* (entry: ProviderAccount) {
  const accounts = yield* Accounts.read.pipe(
    Effect.filterOrFail(
      (accounts) => !Array.some(accounts, (saved) => saved.id === entry.id && saved.provider !== entry.provider),
      () =>
        CliError.UserError.make({
          cause: `Account ${entry.id} belongs to a different provider. Choose a different --account name, or use auth logout first; accounts referenced by profiles cannot be removed.`
        })
    )
  )
  yield* Accounts.write([...Array.filter(accounts, (saved) => saved.id !== entry.id), entry])
}, withLock)
