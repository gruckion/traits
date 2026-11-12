import { Array, Schema as S } from "effect"

import { TraitsSource } from "./TraitsSource.ts"

/** Distinct environments to compose additively; omitted environment names are equivalent to default. */
export type TraitSources = typeof TraitSources.Type
export const TraitSources = S.Array(TraitsSource)
  .check(
    S.makeFilter<ReadonlyArray<TraitsSource>>(
      (sources) =>
        Array.dedupeWith(
          sources,
          (a, b) => a.collection === b.collection && (a.environment ?? "default") === (b.environment ?? "default")
        ).length === sources.length,
      { expected: "distinct collection and environment references, treating omitted environments as default" }
    )
  )
  .annotate({
    description: "Distinct environments to compose additively; omitted environment names are equivalent to default."
  })
