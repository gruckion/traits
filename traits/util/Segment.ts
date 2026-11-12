import { Schema as S } from "effect"

import { InputRange } from "./InputRange.ts"

/** One primary before/after assessment target, with optional historical context for an after target. */
export type Segment = typeof Segment.Type
export const Segment = S.TaggedUnion({
  Before: {
    /** The primary assessment range in before-source UTF-16 coordinates, including deleted material. */
    range: InputRange.annotateKey({
      description: "The primary assessment range in before-source UTF-16 coordinates, including deleted material."
    })
  },
  After: {
    /** The primary assessment range in after-source UTF-16 coordinates. */
    range: InputRange.annotateKey({ description: "The primary assessment range in after-source UTF-16 coordinates." }),
    /** Diff-associated ranges in before-source coordinates, used as context rather than separate targets. Omitted means correspondence unknown; empty means no counterpart. */
    before: S.Array(InputRange)
      .annotate({
        description:
          "Diff-associated ranges in before-source coordinates, used as context rather than separate targets. Omitted means correspondence unknown; empty means no counterpart."
      })
      .pipe(S.optionalKey)
  }
}).annotate({
  description: "One primary before/after assessment target, with optional historical context for an after target."
})
