import { Schema as S } from "effect"

import { WorkspacePath } from "../util/util.ts"
import { Explanation } from "./Explanation.ts"

const module = WorkspacePath.annotateKey({ description: "The configured enrichment module." })

/** What one configured enrichment produced for an input: context supplied to assessment, or why it produced none. */
export type EnrichmentOutcome = typeof EnrichmentOutcome.Type
export const EnrichmentOutcome = S.TaggedUnion({
  /** Context supplied to assessment, including a valid empty string. */
  Succeeded: {
    module,
    /** Successfully generated input-specific context. */
    text: S.String.annotate({ description: "Successfully generated input-specific context." })
  },
  /** The enrichment never initialized; a shared EnrichmentSetup diagnostic explains why. */
  SetupFailed: { module },
  /** Execution raised an error, a defect, or invalid output for this input. */
  Failed: { module, explanation: Explanation },
  /** Input or trait recovery stopped the enrichment before it finished; cancellation has no explanation. */
  Cancelled: { module }
}).annotate({
  description:
    "What one configured enrichment produced for an input: context supplied to assessment, or why it produced none."
})
