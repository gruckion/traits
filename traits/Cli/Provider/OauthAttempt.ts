import { Schema as S } from "effect"

import { ProviderId } from "./ProviderId.ts"

/** Public authorization attempt details; never contains access or refresh tokens. */
export type OauthAttempt = typeof OauthAttempt.Type
export const OauthAttempt = S.Struct({
  /** Nonempty identifier used to track this authorization attempt. */
  id: S.NonEmptyString.annotateKey({ description: "Nonempty identifier used to track this authorization attempt." }),
  /** Provider handling this authorization attempt. */
  provider: ProviderId.annotateKey({ description: "Provider handling this authorization attempt." }),
  /** Provider-advertised authentication method identifier for this attempt. */
  method: S.NonEmptyString.annotateKey({
    description: "Provider-advertised authentication method identifier for this attempt."
  }),
  /** URL the user opens to authorize provider access. */
  url: S.URLFromString.annotateKey({ description: "URL the user opens to authorize provider access." }),
  /** Public guidance for completing this authorization attempt; may be empty. */
  instructions: S.String.annotateKey({
    description: "Public guidance for completing this authorization attempt; may be empty."
  }),
  /** Whether authorization completes automatically (auto) or requires a user-provided code (code). */
  mode: S.Literals(["auto", "code"]).annotateKey({
    description: "Whether authorization completes automatically (auto) or requires a user-provided code (code)."
  }),
  /** Attempt expiration as Unix epoch milliseconds. */
  expiresAt: S.Natural.annotateKey({ description: "Attempt expiration as Unix epoch milliseconds." })
}).annotate({
  description: "Public authorization attempt details; never contains access or refresh tokens."
})
