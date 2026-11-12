import { type Effect, Schema as S } from "effect"

import type { ExtensionServices } from "../ExtensionServices.ts"
import { RecoveryInstruction } from "../util/util.ts"
import type { EnrichmentContext } from "./EnrichmentContext.ts"
import type { EnrichmentError } from "./EnrichmentError.ts"

/**
 * Shared setup producing a per-input context Effect without modifying the trait body.
 * Map expected failures to stage-specific errors with recovery guidance and execution scope.
 * Unexpected defects become runner-normalized diagnostics without inferred recovery targets.
 */
export type Enrichment = Effect.Effect<
  Effect.Effect<string, EnrichmentError, EnrichmentContext | ExtensionServices>,
  EnrichmentSetupError,
  ExtensionServices
>

/** An initialization failure with required recovery guidance. */
export class EnrichmentSetupError extends S.TaggedError<EnrichmentSetupError>()("EnrichmentSetupError", {
  /** Required guidance for resolving enrichment initialization failure; carries no execution cancellation scope. */
  instruction: RecoveryInstruction.annotateKey({
    description:
      "Required guidance for resolving enrichment initialization failure; carries no execution cancellation scope."
  })
}) {
  override get message(): string {
    return `Enrichment initialization failed. ${this.instruction}`
  }
}

export * from "./EnrichmentContext.ts"
export * from "./EnrichmentError.ts"
