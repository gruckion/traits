import { Array, type Effect, Function, pipe, Schema as S, String } from "effect"

import { Change, ChangeWithAfter, ChangeWithBefore } from "./Change.ts"
import { isValidForText } from "./InputRange.ts"
import { Segment } from "./Segment.ts"

const invalidRange =
  "Selected ranges must refer to available source versions, fit within their UTF-16 lengths, and not split surrogate pairs."

const BeforeInput = S.TaggedStruct("Before", {
  /** Available source versions, including the required primary before source. */
  change: ChangeWithBefore.annotateKey({
    description: "Available source versions, including the required primary before source."
  }),
  /** The primary assessment target in the before source. */
  segment: Segment.cases.Before.annotateKey({ description: "The primary assessment target in the before source." })
}).check(
  S.makeFilter((input) => isValidForText(input.segment.range, input.change.before.text), { message: invalidRange })
)

const AfterInput = S.TaggedStruct("After", {
  /** Available source versions, including the required primary after source. */
  change: ChangeWithAfter.annotateKey({
    description: "Available source versions, including the required primary after source."
  }),
  /** The primary assessment target in the after source, with optional historical context. */
  segment: Segment.cases.After.annotateKey({
    description: "The primary assessment target in the after source, with optional historical context."
  })
}).check(
  S.makeFilter(
    (input) =>
      isValidForText(input.segment.range, input.change.after.text) &&
      Array.every(
        input.segment.before ?? [],
        (range) => input.change.before !== undefined && isValidForText(range, input.change.before.text)
      ),
    { message: invalidRange }
  )
)

/** A segment paired with the change it selects from; the tag matches the segment's, so the selected source side is present in both the schema and the static type. Ranges use validated UTF-16 boundaries, without inferred diff correspondence. */
export type Input = typeof Input.Type
export const Input = S.Union([BeforeInput, AfterInput])
  .annotate({
    description:
      "A segment paired with the change it selects from; the tag matches the segment's, so the selected source side is present in both the schema and the static type. Ranges use validated UTF-16 boundaries, without inferred diff correspondence."
  })
  .pipe(S.toTaggedUnion("_tag"))

/** Validates a segment against its source versions and constructs the corresponding input variant. */
export const fromSegment: {
  (segment: Segment): (change: Change) => Effect.Effect<Input, S.SchemaError>
  (change: Change, segment: Segment): Effect.Effect<Input, S.SchemaError>
} = Function.dual(2, (change: Change, segment: Segment) =>
  pipe({ _tag: segment._tag, change, segment }, S.decodeUnknownEffect(Input))
)

/** Selected primary source text; the input must already satisfy the Input schema. */
export const targetText = (input: Input): string =>
  pipe(
    Input.match(input, { Before: (input) => input.change.before.text, After: (input) => input.change.after.text }),
    String.slice(input.segment.range.start, input.segment.range.end)
  )
