import { Effect, Layer, Path, pipe, Schema as S } from "effect"

/** A module whose default export is an Effect Layer. */
export type LayerModule = typeof LayerModule.Type
export const LayerModule = S.Struct({
  default: S.declare<Layer.Any>(Layer.isLayer)
}).annotate({
  description: "A module whose default export is an Effect Layer."
})

/** A layer module could not be imported, or its default export is not an Effect Layer. */
export class LayerModuleLoadError extends S.TaggedError<LayerModuleLoadError>()("LayerModuleLoadError", {
  /** The module path as given, resolved against the current directory. */
  path: S.String.annotateKey({ description: "The module path as given, resolved against the current directory." }),
  /** The import failure; absent when the exports were invalid, since decode failures are dropped so export values such as secrets are not retained. */
  cause: S.Defect()
    .annotateKey({
      description:
        "The import failure; absent when the exports were invalid, since decode failures are dropped so export values such as secrets are not retained."
    })
    .pipe(S.optionalKey)
}) {
  override get message() {
    return `Could not load a layer module from ${this.path}. The module must have an Effect Layer as its default export.`
  }
}

/** Imports a module's default Layer without building it or validating its provided services. */
export const load = Effect.fn("LayerModule.load")(
  function* (filename: string) {
    const path = yield* Path.Path
    const url = yield* path.toFileUrl(path.resolve(filename)).pipe(Effect.orDie)
    const module = yield* Effect.tryPromise((): Promise<unknown> => import(url.href))
    // The decode failure is dropped so that a module's export values, such as secrets, are not retained.
    return yield* pipe(
      module,
      S.decodeUnknownEffect(LayerModule),
      Effect.mapBoth({ onSuccess: (module) => module.default, onFailure: () => undefined })
    )
  },
  (effect, filename) =>
    Effect.mapError(effect, (cause) =>
      LayerModuleLoadError.make({ path: filename, ...(cause === undefined ? {} : { cause }) })
    )
)
