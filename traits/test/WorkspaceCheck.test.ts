import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Array, Effect, FileSystem, Layer, Path, pipe, Schema as S } from "effect"
import { DecisionModel } from "effect/ai"
import { Digest } from "effect/crypto"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { EnrichmentRegistry } from "../Enrichment/EnrichmentRegistry.ts"
import PackageJson from "../package.json" with { type: "json" }
import * as Report from "../Report/Report.ts"
import { SegmenterRegistry } from "../Segmenter/SegmenterRegistry.ts"
import * as TraitFile from "../TraitFile.ts"
import { TraitName } from "../TraitName.ts"
import * as TraitsConfig from "../TraitsConfig.ts"
import * as WorkspaceCheck from "../WorkspaceCheck.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"
import * as WorkspaceTraits from "../WorkspaceTraits.ts"

const traitFile = (name: string, extra = "") =>
  `---\nname: ${name}\npurpose: Protect correctness.\nassertion: The code is correct.\n${extra}---\n\nPrefer small functions.\n`
const models = {
  language: { provider: "openai", model: "gpt-5" },
  decision: { provider: "openai", model: "gpt-5" }
}
const response: DecisionModel.ProviderResponse = {
  answers: {
    assertion: { _tag: "Classify", label: "pass", probabilities: { pass: 0.9, fail: 0.05, na: 0.03, uncertain: 0.02 } }
  },
  usage: { inputTokens: undefined, outputTokens: undefined }
}

/** A Git workspace with two traits, one committed file that is then modified, one deleted, and one untracked. */
const workspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-workspace-check-" })
  const git = (...args: ReadonlyArray<string>) =>
    ChildProcess.make("git", ["-c", "user.name=traits", "-c", "user.email=traits@example.com", ...args], {
      cwd: directory,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    }).pipe(spawner.exitCode)
  yield* fs.makeDirectory(path.join(directory, ".agents", "traits"), { recursive: true })
  yield* fs.makeDirectory(path.join(directory, "src"))
  yield* fs.writeFileString(
    path.join(directory, ".agents", "traits", "_traits.json"),
    JSON.stringify({ version: PackageJson.version, models })
  )
  yield* fs.writeFileString(path.join(directory, ".agents", "traits", "correct.md"), traitFile("correct"))
  yield* fs.writeFileString(path.join(directory, ".agents", "traits", "small.md"), traitFile("small"))
  yield* fs.writeFileString(path.join(directory, "src", "modified.ts"), "export const a = 1\n")
  yield* fs.writeFileString(path.join(directory, "src", "deleted.ts"), "export const b = 2\n")
  const init = yield* git("init", "--quiet")
  expect(init).toBe(0)
  const add = yield* git("add", ".")
  expect(add).toBe(0)
  const commit = yield* git("commit", "--quiet", "-m", "initial")
  expect(commit).toBe(0)
  yield* fs.writeFileString(path.join(directory, "src", "modified.ts"), "export const a = 2\n")
  yield* fs.remove(path.join(directory, "src", "deleted.ts"))
  yield* fs.writeFileString(path.join(directory, "src", "untracked.ts"), "export const c = 3\n")
  return directory
})

const services = (directory: string) =>
  Layer.mergeAll(
    WorkspaceRoot.layer(directory),
    Digest.layerWebCrypto,
    Layer.succeed(SegmenterRegistry, () => Effect.die("Unexpected segmenter")),
    Layer.succeed(EnrichmentRegistry, () => Effect.die("Unexpected enrichment")),
    Layer.effect(DecisionModel.DecisionModel, DecisionModel.make({ decide: () => Effect.succeed(response) }))
  )

it.live("checks working-tree files against their text at HEAD and reports trait origins", () =>
  Effect.gen(function* () {
    const directory = yield* workspace
    const path = yield* Path.Path
    const report = yield* Effect.gen(function* () {
      const config = yield* TraitsConfig.load
      return yield* WorkspaceCheck.run(config, {
        paths: ["src/modified.ts", path.join(directory, "src", "deleted.ts"), "src/untracked.ts", "./src/modified.ts"],
        traits: [TraitName.make("small")]
      })
    }).pipe(Effect.provide(services(directory)))
    expect(Array.map(report.changes, (change) => [change.before?.path, change.after?.path])).toEqual([
      ["src/modified.ts", "src/modified.ts"],
      ["src/deleted.ts", undefined],
      [undefined, "src/untracked.ts"]
    ])
    expect(Array.map(report.traits, (trait) => [trait.trait.name, trait.origin])).toEqual([
      ["small", { path: ".agents/traits/small.md" }]
    ])
    expect(report.traits[0]!.trait.body).toBe("Prefer small functions.")
    yield* pipe(report, S.decodeEffect(Report.Report))
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.live("explains requests and workspaces it cannot check", () =>
  Effect.gen(function* () {
    const directory = yield* workspace
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const run = (request: WorkspaceCheck.WorkspaceCheckRequest) =>
      Effect.gen(function* () {
        const config = yield* TraitsConfig.load
        return yield* WorkspaceCheck.run(config, request)
      }).pipe(Effect.provide(services(directory)), Effect.flip)
    const missing = yield* run({ paths: ["src/missing.ts"] })
    expect(missing._tag).toBe("WorkspaceFileError")
    const outside = yield* run({ paths: ["../outside.ts"] })
    expect(outside._tag).toBe("WorkspaceFileError")
    const unreadable = yield* run({ paths: ["src"] })
    expect(unreadable._tag).toBe("WorkspaceFileError")
    expect(unreadable.message).toContain("cannot be read")
    const unknown = yield* run({ paths: ["src/modified.ts"], traits: [TraitName.make("unknown")] })
    expect(unknown._tag).toBe("UnknownTraitsError")
    yield* fs.writeFileString(
      path.join(directory, ".agents", "traits", "small.md"),
      traitFile("small", "requirement: Legacy.\n")
    )
    const outdated = yield* run({ paths: ["src/modified.ts"] })
    expect(outdated._tag).toBe("TraitFileParseError")
    expect(outdated.message).toContain("traits update")
    yield* fs.writeFileString(
      path.join(directory, ".agents", "traits", "_traits.json"),
      JSON.stringify({
        version: PackageJson.version,
        models,
        extends: [{ collection: "github:example/x" }]
      })
    )
    const extended = yield* run({ paths: ["src/modified.ts"] })
    expect(extended._tag).toBe("ExtendsUnsupportedError")
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.live(
  "selects every trait by default, narrows by environment and then by name, and explains invalid selections",
  () =>
    Effect.gen(function* () {
      const directory = yield* workspace
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const environments = path.join(directory, ".agents", "traits", "_environments")
      const select = (selection: WorkspaceTraits.TraitSelection) =>
        WorkspaceTraits.select(selection).pipe(Effect.provide(WorkspaceRoot.layer(directory)))
      const fail = (selection: WorkspaceTraits.TraitSelection) => Effect.flip(select(selection))
      const environment = WorkspaceTraits.EnvironmentName.make("ci")
      const small = TraitName.make("small")
      const correct = TraitName.make("correct")

      const every = yield* select({})
      expect(every).toEqual(["correct", "small"])
      const named = yield* select({ traits: [small] })
      expect(named).toEqual(["small"])
      const noEnvironments = yield* fail({ environment })
      expect(noEnvironments._tag).toBe("EnvironmentError")
      expect(noEnvironments.message).toContain("No environments are defined")

      yield* fs.makeDirectory(environments)
      yield* fs.writeFileString(path.join(environments, "ci.json"), JSON.stringify({ traits: ["small"] }))
      const inEnvironment = yield* select({ environment })
      expect(inEnvironment).toEqual(["small"])
      const namedInEnvironment = yield* select({ environment, traits: [small] })
      expect(namedInEnvironment).toEqual(["small"])
      const outside = yield* fail({ environment, traits: [correct] })
      expect(outside._tag).toBe("UnknownTraitsError")
      expect(outside.message).toContain('not in environment "ci"')
      const unknown = yield* fail({ environment: WorkspaceTraits.EnvironmentName.make("nightly") })
      expect(unknown.message).toContain("Available environments: ci")

      for (const [contents, tag] of [
        [JSON.stringify({ traits: ["missing"] }), "UnknownTraitsError"],
        [JSON.stringify({ traits: ["small"], exclude: [] }), "EnvironmentError"],
        ["{", "EnvironmentError"],
        [JSON.stringify({ traits: [], extends: [{ collection: "github:example/x" }] }), "EnvironmentError"]
      ] as const) {
        yield* fs.writeFileString(path.join(environments, "ci.json"), contents)
        const invalid = yield* fail({ environment })
        expect(invalid._tag).toBe(tag)
      }
      yield* fs.remove(path.join(environments, "ci.json"))
      yield* fs.makeDirectory(path.join(environments, "ci.json"))
      const unreadable = yield* fail({ environment })
      expect(unreadable._tag).toBe("EnvironmentError")
      expect(unreadable.message).toContain("cannot be read")
      yield* fs.remove(path.join(environments, "ci.json"), { recursive: true })

      // Names start with a letter, so the underscored configuration and environments sort before every trait file.
      expect(S.is(TraitName)("2-space-indent")).toBe(false)
      expect(S.is(WorkspaceTraits.EnvironmentName)("2-ci")).toBe(false)
      for (const file of ["README.md", "2-space-indent.md"]) {
        yield* fs.writeFileString(path.join(directory, ".agents", "traits", file), "# Not a trait\n")
        const misnamed = yield* fail({})
        expect(misnamed._tag).toBe("TraitsDirectoryError")
        yield* fs.remove(path.join(directory, ".agents", "traits", file))
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.effect("parses trait frontmatter, rejects outdated or malformed files, and resolves extensions from the file", () =>
  Effect.gen(function* () {
    const parsed = yield* TraitFile.parse({ path: "traits/a.md", text: traitFile("a") })
    expect(parsed.frontmatter).toEqual({
      name: "a",
      purpose: "Protect correctness.",
      assertion: "The code is correct."
    })
    expect(parsed.body).toBe("Prefer small functions.")
    for (const text of ["no frontmatter", "---\nname: [\n---\n", traitFile("a", "requirement: Legacy.\n")]) {
      const malformed = yield* TraitFile.parse({ path: "traits/a.md", text }).pipe(Effect.flip)
      expect(malformed._tag).toBe("TraitFileParseError")
    }
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-trait-file-" })
    yield* fs.makeDirectory(path.join(directory, ".agents", "traits"), { recursive: true })
    yield* fs.writeFileString(path.join(directory, ".agents", "traits", "segmenter.mjs"), "export default 1")
    yield* fs.writeFileString(
      path.join(directory, ".agents", "traits", "a.md"),
      traitFile("a", "segment: ./segmenter.mjs\n")
    )
    yield* fs.writeFileString(path.join(directory, ".agents", "traits", "b.md"), traitFile("a"))
    const workspaceRoot = WorkspaceRoot.layer(directory)
    const trait = yield* TraitFile.load(TraitName.make("a")).pipe(Effect.provide(workspaceRoot))
    expect(trait.segment).toBe(".agents/traits/segmenter.mjs")
    const mismatch = yield* TraitFile.load(TraitName.make("b")).pipe(Effect.provide(workspaceRoot), Effect.flip)
    expect(mismatch._tag).toBe("TraitFileParseError")
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.live("provides the shared checker from platform services and a workspace root", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-workspace-checker-" })
    const error = yield* WorkspaceCheck.WorkspaceCheck.pipe(
      Effect.flatMap((workspace) => workspace.check({ paths: ["src/a.ts"] })),
      Effect.provide(WorkspaceCheck.WorkspaceCheck.layer.pipe(Layer.provide(WorkspaceRoot.layer(directory)))),
      Effect.flip
    )
    expect(error._tag).toBe("TraitsConfigReadError")
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)
