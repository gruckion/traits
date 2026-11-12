import { Context, Effect, flow, Layer, Schema as S } from "effect"

import * as ExtensionRegistry from "../ExtensionRegistry.ts"
import { type Enrichment, EnrichmentSetupError } from "./Enrichment.ts"
import { EnrichmentError } from "./EnrichmentError.ts"

/** Program-scoped enrichment setup with invocation-local context, chat, and scope. */
export class EnrichmentRegistry extends Context.Service<EnrichmentRegistry>()("traits/Enrichment/EnrichmentRegistry", {
  make: Effect.gen(function* () {
    const { get, run } = yield* ExtensionRegistry.make(
      S.declare((value): value is Effect.Success<Enrichment> => Effect.isEffect(value)),
      EnrichmentSetupError,
      EnrichmentError
    )
    return flow(get, Effect.map(flow(run, Effect.flatMap(S.decodeUnknownEffect(S.String)))))
  })
}) {
  static readonly layer = this.make.pipe(Layer.effect(this))
}
