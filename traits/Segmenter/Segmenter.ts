import { type Effect, Schema as S } from "effect"

import type { ExtensionServices } from "../ExtensionServices.ts"
import { type Change, RecoveryInstruction, type Segment } from "../util/util.ts"

/**
 * Initializes trait-independent segmentation; an empty result selects no targets without diagnostics.
 * The runner validates all segments before enrichment. Failures, defects, or invalid output
 * are reported and block dependent work without fallback. Map expected failures to the
 * stage-specific error, providing instructions rather than recovery scopes.
 * Interruption is cancellation, not an extension failure.
 */
export type Segmenter = Effect.Effect<
  (change: Change) => Effect.Effect<ReadonlyArray<Segment>, SegmenterError, ExtensionServices>,
  SegmenterSetupError,
  ExtensionServices
>

/** A segmentation execution failure with required recovery guidance; dependent work for this change cannot proceed. */
export class SegmenterError extends S.TaggedError<SegmenterError>()("SegmenterError", {
  /** Required actionable guidance for resolving segmentation execution failure before reevaluation. */
  instruction: RecoveryInstruction.annotateKey({
    description: "Required actionable guidance for resolving segmentation execution failure before reevaluation."
  })
}) {
  override get message(): string {
    return `Segmentation execution failed. ${this.instruction}`
  }
}

/** A segmenter initialization failure with required recovery guidance; dependent changes cannot be processed. */
export class SegmenterSetupError extends S.TaggedError<SegmenterSetupError>()("SegmenterSetupError", {
  /** Required actionable guidance for resolving segmenter initialization failure before reevaluation. */
  instruction: RecoveryInstruction.annotateKey({
    description: "Required actionable guidance for resolving segmenter initialization failure before reevaluation."
  })
}) {
  override get message(): string {
    return `Segmenter initialization failed. ${this.instruction}`
  }
}
