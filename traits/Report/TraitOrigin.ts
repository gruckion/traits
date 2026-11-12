import { Schema as S } from "effect"

import { TraitsSource } from "../TraitsEnvironment/TraitsSource.ts"
import { WorkspacePath } from "../util/util.ts"

/** Where a trait definition came from, supplied by the host; at least one of its file or collection is known. */
export type TraitOrigin = typeof TraitOrigin.Type
export const TraitOrigin = S.Struct({
  /** Workspace path of the trait's definition file; omitted when the definition has no workspace file, such as a programmatic or remote definition. */
  path: WorkspacePath.annotateKey({
    description:
      "Workspace path of the trait's definition file; omitted when the definition has no workspace file, such as a programmatic or remote definition."
  }).pipe(S.optionalKey),
  /** The extended collection environment that supplied the trait; omitted for traits defined in this workspace. */
  collection: TraitsSource.annotateKey({
    description:
      "The extended collection environment that supplied the trait; omitted for traits defined in this workspace."
  }).pipe(S.optionalKey)
})
  .annotate({
    description:
      "Where a trait definition came from, supplied by the host; at least one of its file or collection is known."
  })
  .check(
    S.makeFilter((origin) => origin.path !== undefined || origin.collection !== undefined, {
      message: "A trait origin requires a definition path or a collection."
    })
  )
