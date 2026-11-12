import { Schema as S } from "effect"

import { SourceIdentity } from "./SourceIdentity.ts"

/** The source versions of a change, retaining both sides of renames without source text. At least one side is required. */
export type ChangeIdentity = typeof ChangeIdentity.Type
export const ChangeIdentity = S.Union([
  S.Struct({
    /** Original source version. */
    before: SourceIdentity.annotateKey({ description: "Original source version." }),
    /** Current source version; absent for deletions. */
    after: SourceIdentity.annotateKey({ description: "Current source version; absent for deletions." }).pipe(
      S.optionalKey
    )
  }),
  S.Struct({
    /** Original source version; absent for creations. */
    before: SourceIdentity.annotateKey({ description: "Original source version; absent for creations." }).pipe(
      S.optionalKey
    ),
    /** Current source version. */
    after: SourceIdentity.annotateKey({ description: "Current source version." })
  })
]).annotate({
  description:
    "The source versions of a change, retaining both sides of renames without source text. At least one side is required."
})
