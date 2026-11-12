import { Schema as S } from "effect"

import { AccountName } from "./AccountName.ts"

/** Public lifecycle state of an authorization attempt. */
export type OauthAttemptStatus = typeof OauthAttemptStatus.Type
export const OauthAttemptStatus = S.TaggedUnion({
  /** Authorization is still in progress. */
  Pending: {},
  /** Authorization finished and the account was saved. */
  Complete: {
    /** Identifier of the saved provider account created or updated by this authorization attempt. */
    account: AccountName.annotateKey({
      description: "Identifier of the saved provider account created or updated by this authorization attempt."
    })
  },
  /** Authorization failed. */
  Failed: {
    /** Public failure explanation without access tokens, refresh tokens, or other credential values. */
    message: S.String.annotateKey({
      description: "Public failure explanation without access tokens, refresh tokens, or other credential values."
    })
  },
  /** The authorization attempt expired before completion. */
  Expired: {},
  /** The authorization attempt was cancelled before completion. */
  Cancelled: {}
}).annotate({ description: "Public lifecycle state of an authorization attempt." })
