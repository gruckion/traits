import { Schema as S } from "effect"

import { TextDigest, WorkspacePath } from "../util/util.ts"

/** One supplied source version identified by its workspace path and text digest, without retaining its text. */
export type SourceIdentity = typeof SourceIdentity.Type
export const SourceIdentity = S.Struct({
  /** Workspace-relative path of this source version; before and after paths differ for renames. */
  path: WorkspacePath.annotateKey({
    description: "Workspace-relative path of this source version; before and after paths differ for renames."
  }),
  /** Digest of the exact supplied text; compare it with the current text before mapping report ranges onto a file. */
  digest: TextDigest.TextDigest.annotateKey({
    description:
      "Digest of the exact supplied text; compare it with the current text before mapping report ranges onto a file."
  })
}).annotate({
  description:
    "One supplied source version identified by its workspace path and text digest, without retaining its text."
})
