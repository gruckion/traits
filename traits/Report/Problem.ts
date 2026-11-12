import { Schema as S } from "effect"

import { WorkspacePath } from "../util/util.ts"
import { Diagnostic } from "./Diagnostic.ts"
import { Explanation } from "./Explanation.ts"

const location = {
  /** Index into Report.traits. */
  trait: S.Natural.annotate({ description: "Index into Report.traits." }),
  /** Index into Report.changes and the trait report's changes. */
  change: S.Natural.annotate({ description: "Index into Report.changes and the trait report's changes." }),
  /** Index into the evaluated change's inputs. */
  input: S.Natural.annotate({ description: "Index into the evaluated change's inputs." })
}

/** One failure in a report, flattened with its location for clients listing every problem; derived from the report, not stored in it. */
export type Problem = typeof Problem.Type
export const Problem = S.TaggedUnion({
  /** A shared extension failure from Report.diagnostics. */
  Shared: { diagnostic: Diagnostic },
  /** An enrichment failed for one input. */
  Enrichment: {
    ...location,
    /** The configured enrichment module that failed. */
    module: WorkspacePath.annotateKey({ description: "The configured enrichment module that failed." }),
    explanation: Explanation
  },
  /** Assessment failed for one input. */
  Assessment: { ...location, explanation: Explanation }
}).annotate({
  description:
    "One failure in a report, flattened with its location for clients listing every problem; derived from the report, not stored in it."
})
