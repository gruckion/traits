import { Context } from "effect"

import type { Trait } from "../Trait.ts"
import type { Input } from "../util/util.ts"

/** Evaluation inputs for one trait and source location. */
export class EnrichmentContext extends Context.Service<
  EnrichmentContext,
  {
    /** The static trait definition, unchanged by enrichments. */
    readonly trait: Trait
    /** The shared change and validated segment being enriched. */
    readonly input: Input
  }
>()("traits/Enrichment/EnrichmentContext") {}
