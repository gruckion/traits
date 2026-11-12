import { Array, pipe, Schema as S, SchemaTransformation, String } from "effect"

import { AccountName } from "../Provider/AccountName.ts"

/** A saved provider model or custom Effect AI layer module; role capabilities are validated when resolved. */
export type ModelSelection = typeof ModelSelection.Type
export const ModelSelection = S.TaggedUnion({
  Provider: {
    account: AccountName,
    /** The provider's model ID, without whitespace; it may contain slashes, such as `anthropic/claude`. */
    model: S.NonEmptyString.check(S.isPattern(/^\S+$/u)).annotate({
      description: "The provider's model ID, without whitespace; it may contain slashes, such as `anthropic/claude`."
    })
  },
  Custom: {
    /** Path to a TypeScript file whose default export is an Effect AI layer; the CLI stores an absolute path. */
    path: S.NonEmptyString.check(S.isTrimmed(), S.isPattern(/\.ts$/u)).annotate({
      description:
        "Path to a TypeScript file whose default export is an Effect AI layer; the CLI stores an absolute path."
    })
  }
}).annotate({
  description: "A saved provider model or custom Effect AI layer module; role capabilities are validated when resolved."
})

/** A model selection written as text: a path to a `.ts` layer file (absolute, `./` or `../` relative, or a bare filename) is Custom; anything else is a Provider `<account>/<model>` reference split at its first slash. */
export const ModelSelectionFromString = S.String.pipe(
  S.decodeTo(
    ModelSelection,
    SchemaTransformation.transform({
      decode: (text): typeof ModelSelection.Encoded => {
        // Directories require an explicit prefix, so `account/model.ts` remains a provider reference.
        if (/^(?:\.{1,2}[\\/]|[\\/]|[a-zA-Z]:[\\/]).*\.ts$|^[^\\/]+\.ts$/u.test(text)) {
          return { _tag: "Custom", path: text }
        }
        const [account = "", ...model] = pipe(text, String.split("/"))
        return { _tag: "Provider", account, model: pipe(model, Array.join("/")) }
      },
      encode: (selection) =>
        selection._tag === "Provider" ? `${selection.account}/${selection.model}` : selection.path
    })
  )
).annotate({
  description:
    "A model selection written as text: a path to a `.ts` layer file (absolute, `./` or `../` relative, or a bare filename) is Custom; anything else is a Provider `<account>/<model>` reference split at its first slash."
})
