import { Effect, Schema as S } from "effect"
import { Digest } from "effect/crypto"

/** An algorithm-prefixed SHA-256 digest of UTF-8 encoded decoded text; not a Git object ID or raw-byte digest. */
export type TextDigest = typeof TextDigest.Type
export const TextDigest = S.String.check(S.isPattern(/^sha256:[0-9a-f]{64}$/u))
  .pipe(S.brand("traits/TextDigest"))
  .annotate({
    description:
      "An algorithm-prefixed SHA-256 digest of UTF-8 encoded decoded text; not a Git object ID or raw-byte digest."
  })

/** Digests exact decoded text; consumers must decode sources the same way to compare snapshots. */
export const make = Effect.fn("TextDigest.make")(function* (text: string) {
  const digest = yield* Digest.Digest
  const hex = yield* digest.digestHex(Digest.sha256, new TextEncoder().encode(text))
  return TextDigest.make(`sha256:${hex}`)
})
