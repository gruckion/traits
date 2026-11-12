import { Schema as S } from "effect"

import { RecoveryInstruction } from "../util/index.ts"

/** Requested execution skip scope: Enrichment skips only this invocation, Input prevents the current input's assessment, and Trait stops remaining work for this trait; unrelated traits are unaffected. */
export type EnrichmentErrorReason = typeof EnrichmentErrorReason.Type
export const EnrichmentErrorReason = S.TaggedUnion({
  /** Skip only the current enrichment. */
  Enrichment: {},
  /** Skip evaluation of the current trait for this input. */
  Input: {},
  /** Skip remaining work for this trait because a trait-wide prerequisite is unavailable. */
  Trait: {}
}).annotate({
  description:
    "Requested execution skip scope: Enrichment skips only this invocation, Input prevents the current input's assessment, and Trait stops remaining work for this trait; unrelated traits are unaffected."
})

/** An enrichment skip signal with required recovery guidance. */
export class EnrichmentError extends S.TaggedError<EnrichmentError>()("EnrichmentError", {
  /** Requested execution skip scope: Enrichment skips only this invocation, Input prevents the current input's assessment, and Trait stops remaining work for this trait; unrelated traits are unaffected. */
  reason: EnrichmentErrorReason,
  /** Required actionable guidance for resolving the failure before reevaluation. */
  instruction: RecoveryInstruction.annotateKey({
    description: "Required actionable guidance for resolving the failure before reevaluation."
  })
}) {
  override get message(): string {
    const message = EnrichmentErrorReason.match(this.reason, {
      Enrichment: () => "Enrichment skipped.",
      Input: () => "Trait skipped for this input.",
      Trait: () => "Trait skipped for all inputs."
    })
    return `${message} ${this.instruction}`
  }
}
