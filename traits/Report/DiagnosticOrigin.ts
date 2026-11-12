import { Schema as S } from "effect"

import { WorkspacePath } from "../util/util.ts"

/** Which shared extension stage failed: segmenter or enrichment setup for the whole check, or segmentation of one change for every trait sharing the segmenter. */
export type DiagnosticOrigin = typeof DiagnosticOrigin.Type
export const DiagnosticOrigin = S.TaggedUnion({
  /** Segmenter initialization failed before selecting assessment inputs. */
  SegmenterSetup: {
    /** The configured segmenter module whose initialization failed. */
    module: WorkspacePath.annotateKey({ description: "The configured segmenter module whose initialization failed." })
  },
  /** Segmenting one change failed for every trait sharing the segmenter. */
  SegmenterExecution: {
    /** The configured segmenter module whose execution failed. */
    module: WorkspacePath.annotateKey({ description: "The configured segmenter module whose execution failed." }),
    /** Index into Report.changes in original caller order. */
    change: S.Natural.annotate({ description: "Index into Report.changes in original caller order." })
  },
  /** Enrichment initialization failed before processing assessment inputs. */
  EnrichmentSetup: {
    /** The configured enrichment module whose initialization failed. */
    module: WorkspacePath.annotateKey({
      description: "The configured enrichment module whose initialization failed."
    })
  }
}).annotate({
  description:
    "Which shared extension stage failed: segmenter or enrichment setup for the whole check, or segmentation of one change for every trait sharing the segmenter."
})
