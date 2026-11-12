import { Schema as S } from "effect"

import { type Input, targetText } from "./Input.ts"
import { InputRange } from "./InputRange.ts"

/** The compact evidence a decision model sees for one input: the target once, the rest of its file only when the target is part of it, and earlier text only when the segmenter mapped the target to it. */
export type DecisionState = typeof DecisionState.Type
export const DecisionState = S.Struct({
  /** The workspace path of the file the target was selected from. */
  path: S.String.annotateKey({ description: "The workspace path of the file the target was selected from." }),
  /** The file version the target was selected from: after for current text, before for text that was deleted. */
  version: S.Literals(["after", "before"]).annotateKey({
    description:
      "The file version the target was selected from: after for current text, before for text that was deleted."
  }),
  /** The selected text to assess. */
  target: S.String.annotateKey({ description: "The selected text to assess." }),
  /** The complete text of that file version, present only when target is part of it. */
  source: S.String.annotateKey({
    description: "The complete text of that file version, present only when target is part of it."
  }).pipe(S.optionalKey),
  /** The earlier version of the file and the ranges in it that correspond to target; present only when that correspondence is known. */
  history: S.Struct({
    path: S.String,
    text: S.String,
    /** Ranges in text corresponding to target; empty when target has no earlier counterpart. */
    ranges: S.Array(InputRange).annotateKey({
      description: "Ranges in text corresponding to target; empty when target has no earlier counterpart."
    })
  })
    .annotateKey({
      description:
        "The earlier version of the file and the ranges in it that correspond to target; present only when that correspondence is known."
    })
    .pipe(S.optionalKey)
}).annotate({
  description:
    "The compact evidence a decision model sees for one input: the target once, the rest of its file only when the target is part of it, and earlier text only when the segmenter mapped the target to it."
})

/** Builds the decision state for an input without repeating text or sending earlier text whose correspondence is unknown. */
export const decisionState = (input: Input): DecisionState => {
  const source = input._tag === "After" ? input.change.after : input.change.before
  const target = targetText(input)
  const partial = target.length !== source.text.length
  const before = input._tag === "After" ? input.change.before : undefined
  const ranges = input._tag === "After" ? input.segment.before : undefined
  return {
    path: source.path,
    version: input._tag === "After" ? "after" : "before",
    target,
    ...(partial ? { source: source.text } : {}),
    ...(before === undefined || ranges === undefined
      ? {}
      : { history: { path: before.path, text: before.text, ranges } })
  }
}
