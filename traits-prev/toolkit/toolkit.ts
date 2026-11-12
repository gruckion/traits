import { Effect, Layer } from "effect"
import { McpServer, Toolkit } from "effect/ai"

import * as CheckTraits from "./CheckTraits.ts"
import * as DeriveTrait from "./DeriveTrait.ts"

const registrations = McpServer.toolkit(Toolkit.merge(DeriveTrait.toolkit, CheckTraits.toolkit)).pipe(
  Layer.provide(Layer.mergeAll(DeriveTrait.layer, CheckTraits.layer))
)

/** Services captured for tool requests by the registration middleware. */
type RequestServices = McpServer.McpRequest.Only<"Requires", Layer.Services<typeof registrations>>

const services = McpServer.middleware<{ readonly provides: RequestServices }>()(
  Effect.map(Effect.context<RequestServices>(), (context) => (effect) => Effect.provide(effect, context))
)

export const toolkit = registrations.pipe(Layer.provide(services.layer))
