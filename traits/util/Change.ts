import { Schema as S } from "effect"

import { InputSource } from "./InputSource.ts"

const before = InputSource.annotateKey({ description: "The source before the change, with its original path." })
const after = InputSource.annotateKey({ description: "The source after the change, with its current path." })

/** A change with a before source; the after source may also be present. */
export type ChangeWithBefore = typeof ChangeWithBefore.Type
export const ChangeWithBefore = S.Struct({
  before,
  after: after.pipe(S.optionalKey)
}).annotate({
  description: "A change with a before source; the after source may also be present."
})

/** A change with an after source; the before source may also be present. */
export type ChangeWithAfter = typeof ChangeWithAfter.Type
export const ChangeWithAfter = S.Struct({
  before: before.pipe(S.optionalKey),
  after
}).annotate({
  description: "A change with an after source; the before source may also be present."
})

/** At least one before or after source: after-only is creation, before-only is deletion, and both represent an update or rename. */
export type Change = typeof Change.Type
export const Change = S.Union([ChangeWithBefore, ChangeWithAfter]).annotate({
  description:
    "At least one before or after source: after-only is creation, before-only is deletion, and both represent an update or rename."
})
