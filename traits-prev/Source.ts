import { Schema as S } from "effect"

export type SourceLocation = typeof SourceLocation.Type
export const SourceLocation = S.TaggedUnion({
  File: { path: S.String, startLine: S.Int.check(S.isGreaterThan(0)) },
  Generated: {}
})

export type Source = typeof Source.Type
export const Source = S.Struct({
  text: S.String,
  location: SourceLocation.pipe(S.optional)
})
