import { Function, Option, Schema as S, String } from "effect"

/** An ordered UTF-16 text range; [0, text.length) selects the whole source, including [0, 0) for empty text. */
export type InputRange = typeof InputRange.Type
export const InputRange = S.Struct({
  /** Inclusive starting offset in zero-based UTF-16 code units. */
  start: S.Natural.annotate({ description: "Inclusive starting offset in zero-based UTF-16 code units." }),
  /** Exclusive ending offset in UTF-16 code units, at least the starting offset. */
  end: S.Natural.annotate({
    description: "Exclusive ending offset in UTF-16 code units, at least the starting offset."
  })
})
  .annotate({
    description:
      "An ordered UTF-16 text range; [0, text.length) selects the whole source, including [0, 0) for empty text."
  })
  .check(
    S.makeFilter((range) => range.end >= range.start, {
      message: "Range end must not precede its start."
    })
  )

/** Whether a range has nonnegative, ordered integer offsets and fits the text without splitting surrogate pairs. */
export const isValidForText: {
  (text: string): (range: InputRange) => boolean
  (range: InputRange, text: string): boolean
} = Function.dual(
  2,
  (range: InputRange, text: string): boolean =>
    S.is(InputRange)(range) &&
    range.end <= text.length &&
    !Option.exists(String.codePointAt(text, range.start - 1), (code) => code > 0xffff) &&
    !Option.exists(String.codePointAt(text, range.end - 1), (code) => code > 0xffff)
)
