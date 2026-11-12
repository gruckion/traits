import { Context, Effect, flow, Layer, Predicate, Schema as S } from "effect"

import * as ExtensionRegistry from "../ExtensionRegistry.ts"
import * as Segmenter from "./Segmenter.ts"

/** Program-scoped segmenter setup with fresh execution chats and scopes. */
export class SegmenterRegistry extends Context.Service<SegmenterRegistry>()("traits/Segmenter/SegmenterRegistry", {
  make: Effect.gen(function* () {
    const { get, run } = yield* ExtensionRegistry.make(
      S.declare((value): value is Effect.Success<Segmenter.Segmenter> => Predicate.isFunction(value)),
      Segmenter.SegmenterSetupError,
      Segmenter.SegmenterError
    )
    return flow(
      get,
      Effect.map((execute) => flow(execute, run))
    )
  })
}) {
  static readonly layer = this.make.pipe(Layer.effect(this))
}
