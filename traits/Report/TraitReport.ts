import { Array, Schema as S } from "effect"

import { Trait } from "../Trait.ts"
import { ChangeReport } from "./ChangeReport.ts"
import { EnrichmentOutcome } from "./EnrichmentOutcome.ts"
import { InputReport } from "./InputReport.ts"
import { TraitOrigin } from "./TraitOrigin.ts"

/** One trait's static definition and origin, with one result per supplied change. */
export type TraitReport = typeof TraitReport.Type
export const TraitReport = S.Struct({
  /** The unchanged static trait definition, included once for these results. */
  trait: Trait.annotateKey({ description: "The unchanged static trait definition, included once for these results." }),
  /** Where the host loaded the trait definition from; omitted when the host did not supply it. */
  origin: TraitOrigin.annotateKey({
    description: "Where the host loaded the trait definition from; omitted when the host did not supply it."
  }).pipe(S.optionalKey),
  /** One result per supplied change, aligned with Report.changes. */
  changes: S.Array(ChangeReport).annotate({
    description: "One result per supplied change, aligned with Report.changes."
  })
})
  .annotate({ description: "One trait's static definition and origin, with one result per supplied change." })
  .check(
    S.makeFilter(
      (report) => {
        const { trait } = report
        const configured = trait.enrichments ?? []
        const aligned = (enrichments: ReadonlyArray<EnrichmentOutcome>) =>
          enrichments.length === configured.length &&
          Array.every(enrichments, (enrichment, index) => enrichment.module === configured[index])
        return Array.every(report.changes, (change) =>
          ChangeReport.match(change, {
            Ignored: () => true,
            NotSegmented: () => trait.segment !== undefined,
            Evaluated: (evaluated) =>
              Array.every(evaluated.inputs, (input) =>
                InputReport.match(input, {
                  Unmatched: () => trait.subject !== undefined,
                  Completed: (completed) =>
                    aligned(completed.enrichments) &&
                    (completed.subject !== undefined) === (trait.subject !== undefined) &&
                    (completed.assessment !== undefined) === (trait.assertion !== undefined),
                  Failed: (failed) =>
                    aligned(failed.enrichments) &&
                    (failed.subject === undefined || trait.subject !== undefined) &&
                    (failed.explanation === undefined
                      ? Array.some(failed.enrichments, EnrichmentOutcome.guards.Failed)
                      : // Explained by a failed subject decision, which leaves no probabilities, or a failed assessment.
                        (trait.subject !== undefined && failed.subject === undefined) || trait.assertion !== undefined),
                  Cancelled: (cancelled) =>
                    aligned(cancelled.enrichments) && (cancelled.subject === undefined || trait.subject !== undefined)
                })
              )
          })
        )
      },
      {
        message:
          "Input enrichments must align with the trait's enrichments; only traits with a subject report subject decisions or Unmatched inputs, and completed inputs carry one exactly when the trait has a subject; completed inputs carry an assessment exactly when the trait has an assertion; failed inputs are explained by a subject decision or assessment failure, or a failed enrichment; only segmented traits can be NotSegmented."
      }
    )
  )
