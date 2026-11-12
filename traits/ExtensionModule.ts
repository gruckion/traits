import { Array, Effect, Path, pipe, Predicate, Schema as S, String } from "effect"
import { resolve as resolveImport } from "import-meta-resolve"

import type { ExtensionServices } from "./ExtensionServices.ts"
import { WorkspacePath } from "./util/WorkspacePath.ts"
import { WorkspaceRoot } from "./WorkspaceRoot.ts"

/** A module whose default export initializes a trait extension. */
export const ExtensionModule = <A, E>() =>
  S.Struct({
    default: S.declare((value): value is Effect.Effect<A, E, ExtensionServices> => Effect.isEffect(value))
  }).annotate({
    description: "A module whose default export is an Effect that initializes a trait extension."
  })

/** An extension reference and the explicit file URL supplying its resolution context. */
export type ResolveInput = typeof ResolveInput.Type
export const ResolveInput = S.Struct({
  /** The unresolved reference supplied by the host, not extension source text. */
  reference: S.String.annotate({
    description: "The unresolved extension path or ESM package reference supplied by the host."
  }),
  /** The explicit trait-file or host-module file URL used as the resolution base. */
  baseUrl: S.URL.annotate({
    description: "The explicit trait-file or host-module file URL used as the resolution base."
  })
}).annotate({ description: "An extension reference and the explicit file URL supplying its resolution context." })

/** A host could not resolve an extension reference to a module file within the workspace. */
export class ModuleResolutionError extends S.TaggedError<ModuleResolutionError>()("ModuleResolutionError", {
  input: ResolveInput,
  /** The original resolution or validation failure; not serialized into check diagnostics. */
  cause: S.Defect().annotate({
    description: "The original resolution or validation failure, kept outside check diagnostics."
  })
}) {
  override get message(): string {
    return `Could not resolve extension ${this.input.reference} from ${this.input.baseUrl.href} to a module within the workspace.`
  }
}

/** Resolves an ESM reference from a trait file or explicit host-module URL, not from the traits installation, to the canonical module file's workspace path. */
export const resolve = Effect.fn("ExtensionModule.resolve")(
  function* (input: ResolveInput) {
    const { directory } = yield* WorkspaceRoot
    const path = yield* Path.Path
    const url = yield* Effect.try({
      try: () => new URL(resolveImport(input.reference, input.baseUrl.href)),
      catch: (cause) => ModuleResolutionError.make({ input, cause })
    })
    const file = yield* path
      .fromFileUrl(url)
      .pipe(Effect.mapError((cause) => ModuleResolutionError.make({ input, cause })))
    return yield* pipe(
      path.relative(directory, file),
      String.split(path.sep),
      Array.join("/"),
      S.decodeEffect(WorkspacePath)
    )
  },
  (effect, input) =>
    effect.pipe(Effect.catchTags({ SchemaError: (cause) => ModuleResolutionError.make({ input, cause }) }))
)

/** Loads and initializes an extension file, preserving validation errors and declared setup failures. */
export const load = Effect.fnUntraced(function* <A, E>(
  url: URL,
  result: S.ConstraintDecoder<A>,
  error: S.Constraint & { readonly Type: E }
) {
  const imported = yield* Effect.promise(() => import(url.href))
  const extension = yield* pipe(imported, S.decodeUnknownEffect(ExtensionModule<A, E>()))
  const execute = yield* extension.default.pipe(
    Effect.catchIf(Predicate.not(Predicate.or(S.is(error), S.isSchemaError)), Effect.die)
  )
  return yield* pipe(execute, S.decodeUnknownEffect(result))
})
