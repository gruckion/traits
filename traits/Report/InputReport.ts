import { Schema as S } from "effect"

import { TraitSubjectMatch } from "../TraitSubject.ts"
import { Segment, TextDigest } from "../util/util.ts"
import { Assessment } from "./Assessment.ts"
import { EnrichmentOutcome } from "./EnrichmentOutcome.ts"
import { Explanation } from "./Explanation.ts"

const target = {
  /** One primary before/after assessment target, with optional historical context for an after target. */
  segment: Segment,
  /** Digest of the primary target text; with the trait name and primary path, identifies the target across reports despite offset shifts. Identical target texts share a digest. */
  digest: TextDigest.TextDigest.annotateKey({
    description:
      "Digest of the primary target text; with the trait name and primary path, identifies the target across reports despite offset shifts. Identical target texts share a digest."
  })
}

const fields = {
  ...target,
  /** Subject-membership probabilities; present when the trait has a subject and its decision completed without ruling the target out. */
  subject: TraitSubjectMatch.annotateKey({
    description:
      "Subject-membership probabilities; present when the trait has a subject and its decision completed without ruling the target out."
  }).pipe(S.optionalKey),
  /** One outcome per configured enrichment, aligned with the trait's enrichments. */
  enrichments: S.Array(EnrichmentOutcome).annotate({
    description: "One outcome per configured enrichment, aligned with the trait's enrichments."
  })
}

/** A source-free report for one assessment input, tagged by execution state rather than assertion acceptance. */
export type InputReport = typeof InputReport.Type
export const InputReport = S.TaggedUnion({
  /** Required work finished; assertion traits carry an assessment and guidance-only traits do not. */
  Completed: {
    ...fields,
    /** Assertion probabilities; present exactly when the trait has an assertion. */
    assessment: Assessment.annotateKey({
      description: "Assertion probabilities; present exactly when the trait has an assertion."
    }).pipe(S.optionalKey)
  },
  /** The subject decision ruled the target out, so enrichments and the assertion did not run. */
  Unmatched: {
    ...target,
    /** Subject-membership probabilities from the decision that ruled the target out. */
    subject: TraitSubjectMatch.annotateKey({
      description: "Subject-membership probabilities from the decision that ruled the target out."
    })
  },
  /** The input could not finish because its subject decision or assessment failed, or an enrichment's recovery stopped it. */
  Failed: {
    ...fields,
    /** Why the subject decision or assessment failed; omitted when a Failed enrichment's recovery stopped the input instead. */
    explanation: Explanation.annotateKey({
      description:
        "Why the subject decision or assessment failed; omitted when a Failed enrichment's recovery stopped the input instead."
    }).pipe(S.optionalKey)
  },
  /** Another input's trait-wide recovery stopped this input before it finished. */
  Cancelled: fields
}).annotate({
  description:
    "A source-free report for one assessment input, tagged by execution state rather than assertion acceptance."
})
