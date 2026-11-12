import { expect, it } from "@effect/vitest"
import { Effect, pipe, Schema as S } from "effect"

import * as Frontmatter from "../_util/Frontmatter.ts"

it.effect(
  "reports document errors with the source path and YAML position",
  Effect.fnUntraced(function* () {
    for (const example of [
      { text: "Body", error: { _tag: "MissingFrontmatterError" } },
      { text: "---\nname: example", error: { _tag: "UnterminatedFrontmatterError" } },
      {
        text: "---\nname: [\n---\nBody",
        error: { _tag: "InvalidYamlError", line: 3, column: 1, cause: expect.any(Error) }
      }
    ]) {
      const result = yield* pipe(
        { text: example.text, path: "/docs/example.md" },
        Frontmatter.parse(S.JsonObject),
        Effect.result
      )
      expect(result).toMatchObject({ _tag: "Failure", failure: { ...example.error, path: "/docs/example.md" } })
    }
  })
)

it.effect(
  "decodes supplied schemas and preserves body delimiters and line endings",
  Effect.fnUntraced(function* () {
    const document = yield* pipe(
      {
        text: "---\r\ntitle: Example\r\n---\r\nBody\r\n---\r\n",
        path: "/docs/example.md"
      },
      Frontmatter.parse(S.Struct({ title: S.String }))
    )
    expect(document).toEqual({ frontmatter: { title: "Example" }, body: "Body\r\n---\r\n" })
    const invalid = yield* pipe(
      {
        text: "---\ntitle: 2\n---",
        path: "/docs/example.md"
      },
      Frontmatter.parse(S.Struct({ title: S.String })),
      Effect.result
    )
    expect(invalid).toMatchObject({ _tag: "Failure", failure: { _tag: "SchemaError" } })
  })
)
