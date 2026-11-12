import { Schema as S } from "effect"

import { RecoveryInstruction } from "../util/util.ts"

/** Why something failed: actionable remediation when known, otherwise safe failure details; never raw error objects or source excerpts. */
export type Explanation = typeof Explanation.Type
export const Explanation = S.TaggedUnion({
  Error: {
    /** Safe, normalized failure details when remediation is unknown; excludes raw error objects and source excerpts. */
    error: S.NonEmptyString.check(S.isPattern(/\S/u)).annotate({
      description:
        "Safe, normalized failure details when remediation is unknown; excludes raw error objects and source excerpts."
    })
  },
  Instruction: {
    /** Actionable remediation including relevant failure context, replacing standalone error details. */
    instruction: RecoveryInstruction.annotateKey({
      description: "Actionable remediation including relevant failure context, replacing standalone error details."
    })
  }
}).annotate({
  description:
    "Why something failed: actionable remediation when known, otherwise safe failure details; never raw error objects or source excerpts."
})
