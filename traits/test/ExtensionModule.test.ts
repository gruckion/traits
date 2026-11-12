import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, pipe, Result, Schema as S } from "effect"

import * as ExtensionModule from "../ExtensionModule.ts"
import { Trait } from "../Trait.ts"
import { WorkspacePath } from "../util/util.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"

const services = Layer.merge(NodeServices.layer, WorkspaceRoot.layer(".").pipe(Layer.provide(NodeServices.layer)))

it.effect("rejects resolver output that is not a module file", () =>
  Effect.gen(function* () {
    for (const reference of ["node:fs", "data:text/javascript,export default 1"]) {
      const input = { reference, baseUrl: new URL(import.meta.url) }
      const result = yield* ExtensionModule.resolve(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("ModuleResolutionError")
        expect(result.failure.input).toEqual(input)
      }
    }
  }).pipe(Effect.provide(services))
)

it.effect("accepts only normalized workspace-relative POSIX paths", () =>
  Effect.gen(function* () {
    for (const reference of [
      "",
      "./local.ts",
      "../local.ts",
      "nested/../local.ts",
      "nested//local.ts",
      "nested/",
      "nested/..",
      "nested/.",
      "/absolute.ts",
      "C:/absolute.ts",
      "c:relative.ts",
      "nested\\local.ts",
      "file:///module.mjs"
    ]) {
      expect(S.is(WorkspacePath)(reference)).toBe(false)
    }
    for (const reference of ["node_modules/@traits/typescript/segmenter/index.js", ".gitignore", "a..b/..."]) {
      expect(S.is(WorkspacePath)(reference)).toBe(true)
    }
    expect(S.toJsonSchemaDocument(WorkspacePath).schema).toHaveProperty("pattern")
    const unresolvedTrait = yield* pipe(
      { name: "example", purpose: "Protect correctness.", segment: "./segmenter.mjs" },
      S.decodeEffect(Trait),
      Effect.result
    )
    expect(Result.isFailure(unresolvedTrait)).toBe(true)
  })
)

it.effect(
  "resolves canonical module files relative to the workspace, ignoring queries and fragments, and rejects modules outside it",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-module-specifier-" })
        yield* fs.makeDirectory(path.join(directory, ".agents", "traits", "extensions"), { recursive: true })
        yield* fs.writeFileString(
          path.join(directory, ".agents", "traits", "extensions", "local.mjs"),
          "export default 1"
        )
        const baseUrl = yield* path.toFileUrl(path.join(directory, ".agents", "traits", "example.md"))
        const workspace = WorkspaceRoot.layer(directory).pipe(Layer.provide(NodeServices.layer))
        for (const reference of [
          "./extensions/local.mjs",
          "./extensions/local.mjs?copy",
          "./extensions/local.mjs#copy"
        ]) {
          const local = yield* ExtensionModule.resolve({ reference, baseUrl }).pipe(Effect.provide(workspace))
          expect(local).toBe(".agents/traits/extensions/local.mjs")
        }
        const outside = yield* ExtensionModule.resolve({
          reference: import.meta.resolve("effect"),
          baseUrl
        }).pipe(Effect.provide(workspace), Effect.result)
        expect(Result.isFailure(outside)).toBe(true)
        if (Result.isFailure(outside)) {
          expect(outside.failure._tag).toBe("ModuleResolutionError")
        }
      })
    ).pipe(Effect.provide(NodeServices.layer))
)
