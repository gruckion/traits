import { Schema as S } from "effect"

/** Secret material for a saved provider account; encoding secrets produces plaintext, not encryption. */
export type Credential = typeof Credential.Type
export const Credential = S.TaggedUnion({
  ApiKey: {
    /** Provider API key, redacted in memory; encoding writes its plaintext value. */
    apiKey: S.RedactedFromValue(S.NonEmptyString).annotateKey({
      description: "Provider API key, redacted in memory; encoding writes its plaintext value."
    })
  },
  Oauth: {
    /** OAuth access token used to authorize provider requests, redacted in memory. */
    accessToken: S.RedactedFromValue(S.NonEmptyString).annotateKey({
      description: "OAuth access token used to authorize provider requests, redacted in memory."
    }),
    /** Optional OAuth refresh token used to renew access, redacted in memory. */
    refreshToken: S.RedactedFromValue(S.NonEmptyString)
      .annotateKey({
        description: "Optional OAuth refresh token used to renew access, redacted in memory."
      })
      .pipe(S.optionalKey),
    /** Optional access token expiration as Unix epoch milliseconds. */
    expiresAt: S.Natural.annotateKey({
      description: "Optional access token expiration as Unix epoch milliseconds."
    }).pipe(S.optionalKey),
    /** Optional unique authorization scopes granted to this credential. */
    scopes: S.Array(S.NonEmptyString)
      .check(S.isUnique())
      .annotateKey({
        description: "Optional unique authorization scopes granted to this credential."
      })
      .pipe(S.optionalKey),
    /** Optional provider-specific string metadata; values are not redacted. */
    metadata: S.Record(S.String, S.String)
      .annotateKey({
        description: "Optional provider-specific string metadata; values are not redacted."
      })
      .pipe(S.optionalKey)
  }
}).annotate({
  description: "Secret material for a saved provider account; encoding secrets produces plaintext, not encryption."
})
