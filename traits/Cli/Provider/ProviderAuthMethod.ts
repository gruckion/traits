import { Schema as S } from "effect"

/** A provider-advertised authentication method; availability is determined by its implementation. */
export type ProviderAuthMethod = typeof ProviderAuthMethod.Type
export const ProviderAuthMethod = S.TaggedUnion({
  ApiKey: {
    id: S.NonEmptyString.check(S.isTrimmed()),
    label: S.NonEmptyString
  },
  Oauth: {
    id: S.NonEmptyString.check(S.isTrimmed()),
    label: S.NonEmptyString
  }
}).annotate({
  description: "A provider-advertised authentication method; availability is determined by its implementation."
})
