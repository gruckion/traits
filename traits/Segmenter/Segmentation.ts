import { Array, Effect, flow, Function, Order, Schema as S } from "effect"

import { type Change, Input, Segment } from "../util/util.ts"

const segmentOrder = Order.make<Input>(
  (left, right) =>
    Order.Number(Input.guards.Before(left) ? 0 : 1, Input.guards.Before(right) ? 0 : 1) ||
    Order.Number(left.segment.range.start, right.segment.range.start) ||
    Order.Number(left.segment.range.end, right.segment.range.end)
)

/** Segments one change into unvalidated segments, as a segmenter's execution does. */
type SegmentChange<E, R> = (change: Change) => Effect.Effect<ReadonlyArray<Segment>, E, R>

/** Rejects the whole result if any segment is invalid for its source, then orders targets deterministically. */
export const execute: {
  (change: Change): <E, R>(segment: SegmentChange<E, R>) => Effect.Effect<Array<Input>, E | S.SchemaError, R>
  <E, R>(segment: SegmentChange<E, R>, change: Change): Effect.Effect<Array<Input>, E | S.SchemaError, R>
} = Function.dual(2, <E, R>(segment: SegmentChange<E, R>, change: Change) =>
  Effect.suspend(() => segment(change)).pipe(
    Effect.flatMap(S.decodeUnknownEffect(S.Array(Segment))),
    Effect.flatMap(
      flow(
        Array.map((segment: Segment) => ({ _tag: segment._tag, change, segment })),
        S.decodeUnknownEffect(S.Array(Input))
      )
    ),
    Effect.map(Array.sort(segmentOrder))
  )
)
