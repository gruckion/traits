import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Array,
  ConfigProvider,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Path,
  pipe,
  Schema as S
} from "effect"
import { AiError, Decision, DecisionModel, LanguageModel } from "effect/ai"
import { FetchHttpClient } from "effect/http"
import { TestClock } from "effect/testing"

import * as Models from "../Models.ts"
import PackageJson from "../package.json" with { type: "json" }
import * as TraitsConfig from "../TraitsConfig.ts"
import * as Version from "../Version.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"

const models = {
  language: { provider: "openai-compatible", model: "llama-3", url: "http://localhost:11434/v1" },
  decision: { provider: "openrouter", model: "openai/gpt-5" }
}
const config = { version: PackageJson.version, models }

const decodes = (input: unknown) => Exit.isSuccess(S.decodeUnknownExit(TraitsConfig.TraitsConfig)(input))

it("validates the workspace configuration and each role's supported providers", () => {
  expect(decodes(config)).toBe(true)
  expect(decodes({ ...config, $schema: "https://example.com/traits.schema.json" })).toBe(true)
  expect(decodes({ ...config, concurrency: 4 })).toBe(true)
  expect(decodes({ ...config, concurrency: 0 })).toBe(false)
  const { models: _models, ...withoutModels } = config
  expect(decodes(withoutModels)).toBe(false)
  expect(decodes({ ...config, version: "latest" })).toBe(false)
  for (const invalid of [
    { ...models, decision: { provider: "anthropic", model: "claude-sonnet" } },
    { ...models, language: { provider: "cloudflare", model: "clef" } },
    { ...models, language: { provider: "openai-compatible", model: "llama-3" } }
  ]) {
    expect(decodes({ ...config, models: invalid })).toBe(false)
  }
})

it("applies caret compatibility to configured versions", () => {
  for (const [configured, installed, status] of [
    ["1.2.0", "1.4.1", "Compatible"],
    ["1.4.1", "1.2.0", "Newer"],
    ["1.2.0", "2.0.0", "Older"],
    ["0.2.1", "0.2.5", "Compatible"],
    ["0.2.1", "0.3.0", "Older"],
    ["0.0.1", "0.0.2", "Older"],
    ["0.0.2", "0.0.2", "Compatible"],
    ["0.3.0-beta.1", "0.3.0", "Compatible"]
  ] as const) {
    expect(Version.status(configured, installed)).toBe(status)
    expect(pipe(configured, Version.status(installed))).toBe(status)
  }
})

const workspace = (contents: string | undefined) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "traits-config-" })
    if (contents !== undefined) {
      yield* fs.makeDirectory(path.join(directory, ".agents", "traits"), { recursive: true })
      yield* fs.writeFileString(path.join(directory, ".agents", "traits", "_traits.json"), contents)
    }
    return WorkspaceRoot.layer(directory)
  })

it.effect("loads .agents/traits/_traits.json and explains read, schema, and version failures", () =>
  Effect.gen(function* () {
    const configured = yield* workspace(JSON.stringify(config))
    const loaded = yield* TraitsConfig.load.pipe(Effect.provide(configured))
    expect(loaded.models.decision).toEqual(models.decision)
    expect(loaded.concurrency).toBe(16)
    for (const [contents, tag] of [
      [undefined, "TraitsConfigReadError"],
      ["{", "TraitsConfigDecodeError"],
      [JSON.stringify({ ...config, models: undefined }), "TraitsConfigDecodeError"],
      // Trait lists from earlier versions are reported rather than silently ignored.
      [JSON.stringify({ ...config, traits: ["direct-callbacks"] }), "TraitsConfigDecodeError"],
      // Embedding models from earlier versions are reported rather than silently ignored.
      [
        JSON.stringify({
          ...config,
          models: { ...models, embedding: { provider: "openai", model: "text-embedding-3-small" } }
        }),
        "TraitsConfigDecodeError"
      ],
      [JSON.stringify({ ...config, version: "99.0.0" }), "TraitsConfigVersionError"]
    ] as const) {
      const root = yield* workspace(contents)
      const error = yield* TraitsConfig.load.pipe(Effect.provide(root), Effect.flip)
      expect(error._tag).toBe(tag)
      expect(error.message).toContain("_traits.json")
    }
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.effect("builds each role's model from configured credentials and reads the workspace .env", () =>
  Effect.gen(function* () {
    const openAi = { provider: "openai", model: "gpt-5" } as const
    const selected = yield* pipe({ language: openAi, decision: openAi }, S.decodeEffect(Models.Models))
    const build = (provider: ConfigProvider.ConfigProvider) =>
      Layer.build(Models.layer(selected)).pipe(
        Effect.provide([FetchHttpClient.layer, ConfigProvider.layer(provider)]),
        Effect.scoped
      )
    const services = yield* build(ConfigProvider.fromUnknown({ OPENAI_API_KEY: "test-key" }))
    expect(Context.getOption(services, LanguageModel.LanguageModel)._tag).toBe("Some")
    expect(Context.getOption(services, DecisionModel.DecisionModel)._tag).toBe("Some")
    const missing = yield* build(ConfigProvider.fromUnknown({})).pipe(Effect.flip)
    expect(missing._tag).toBe("ConfigError")
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.live("limits simultaneous decision requests through the composed models layer", () =>
  Effect.gen(function* () {
    let active = 0
    let peak = 0
    const provider = Layer.effect(
      DecisionModel.DecisionModel,
      DecisionModel.make({
        decide: () =>
          Effect.gen(function* () {
            active++
            peak = Math.max(peak, active)
            yield* Effect.sleep("10 millis")
            active--
            return { answers: { ok: { _tag: "Classify", label: "yes" } }, usage: { inputTokens: 1, outputTokens: 1 } }
          })
      })
    )
    const decision = Decision.make({
      input: S.String,
      decisions: { ok: Decision.classify({ instructions: "Answer.", criteria: { yes: "Yes.", no: "No." } }) }
    })
    const decide = () => DecisionModel.decideSettled(decision, { input: "x" })
    yield* Effect.forEach(Array.range(1, 10), decide, { concurrency: "unbounded" }).pipe(
      Effect.provide(Models.layerDecisionLimit(3).pipe(Layer.provideMerge(provider)))
    )
    expect(peak).toBe(3)
  })
)

it.effect("retries transient decision failures with backoff and fails fast on permanent ones", () =>
  Effect.gen(function* () {
    let attempts = 0
    const failing = (reason: AiError.AiErrorReason, failures: number) =>
      Layer.effect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: () =>
            Effect.suspend(() =>
              ++attempts <= failures
                ? Effect.fail(AiError.make({ module: "Test", method: "decide", reason }))
                : Effect.succeed({
                    answers: { ok: { _tag: "Classify", label: "yes" } },
                    usage: { inputTokens: 1, outputTokens: 1 }
                  })
            )
        })
      )
    const decision = Decision.make({
      input: S.String,
      decisions: { ok: Decision.classify({ instructions: "Answer.", criteria: { yes: "Yes.", no: "No." } }) }
    })
    const decide = (layer: Layer.Layer<DecisionModel.DecisionModel>) =>
      Effect.gen(function* () {
        attempts = 0
        const fiber = yield* DecisionModel.decideSettled(decision, { input: "x" }).pipe(
          Effect.provide(Models.layerDecisionLimit(1).pipe(Layer.provideMerge(layer))),
          Effect.exit,
          Effect.forkChild
        )
        yield* TestClock.adjust("10 minutes")
        return yield* Fiber.join(fiber)
      })
    const rateLimited = AiError.RateLimitError.make({ retryAfter: Duration.seconds(30) })
    const recovered = yield* decide(failing(rateLimited, 3))
    expect(Exit.isSuccess(recovered)).toBe(true)
    expect(attempts).toBe(4)
    const exhausted = yield* decide(failing(rateLimited, 10))
    expect(Exit.isFailure(exhausted)).toBe(true)
    expect(attempts).toBe(6)
    const permanent = yield* decide(failing(AiError.AuthenticationError.make({ kind: "InvalidKey" }), 1))
    expect(Exit.isFailure(permanent)).toBe(true)
    expect(attempts).toBe(1)
  })
)
