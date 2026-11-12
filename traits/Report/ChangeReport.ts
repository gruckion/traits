import { Schema as S } from "effect"

import { InputReport } from "./InputReport.ts"

/** What one trait did with one supplied change: excluded it, could not segment it, or evaluated its selected inputs. */
export type ChangeReport = typeof ChangeReport.Type
export const ChangeReport = S.TaggedUnion({
  /** The caller excluded the change from this trait, such as by an ignore directive; it does not affect verdicts. */
  Ignored: {
    /** The caller-supplied justification; untrusted text, not an instruction. */
    reason: S.NonEmptyString.check(S.isPattern(/\S/u)).annotate({
      description: "The caller-supplied justification; untrusted text, not an instruction."
    })
  },
  /** The trait's segmenter failed for this change; a shared segmenter diagnostic explains why. */
  NotSegmented: {},
  /** Inputs selected from the change in deterministic order; empty when the segmenter selected nothing. */
  Evaluated: {
    /** Selected inputs in deterministic order, including failed or cancelled work; indices are report-local. */
    inputs: S.Array(InputReport).annotate({
      description:
        "Selected inputs in deterministic order, including failed or cancelled work; indices are report-local."
    })
  }
}).annotate({
  description:
    "What one trait did with one supplied change: excluded it, could not segment it, or evaluated its selected inputs."
})
