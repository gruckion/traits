import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { CloudflareClient, CloudflareDecisionModel } from "@effect/ai-cloudflare"
import { OpenAiClient, OpenAiDecisionModel, OpenAiLanguageModel } from "@effect/ai-openai"
import * as OpenAiCompatible from "@effect/ai-openai-compat"
import { OpenRouterClient, OpenRouterDecisionModel, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { Config, Duration, Effect, Layer, Schedule, Schema as S, Semaphore } from "effect"
import { type AiError, DecisionModel } from "effect/ai"

const model = S.NonEmptyString.check(S.isTrimmed()).annotate({ description: "The provider's model ID." })

/** An OpenAI model; the API key is read from OPENAI_API_KEY. */
const OpenAi = S.Struct({ provider: S.Literal("openai"), model }).annotate({
  description: "An OpenAI model; the API key is read from OPENAI_API_KEY."
})

/** An Anthropic model; the API key is read from ANTHROPIC_API_KEY. */
const Anthropic = S.Struct({ provider: S.Literal("anthropic"), model }).annotate({
  description: "An Anthropic model; the API key is read from ANTHROPIC_API_KEY."
})

/** An OpenRouter model; the API key is read from OPENROUTER_API_KEY. */
const OpenRouter = S.Struct({ provider: S.Literal("openrouter"), model }).annotate({
  description: "An OpenRouter model; the API key is read from OPENROUTER_API_KEY."
})

/** A Cloudflare Workers AI model; credentials are read from CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. */
const Cloudflare = S.Struct({ provider: S.Literal("cloudflare"), model }).annotate({
  description:
    "A Cloudflare Workers AI model; credentials are read from CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
})

/** A model served by any OpenAI-compatible API, such as a local or self-hosted server. */
const OpenAiCompatibleModel = S.Struct({
  provider: S.Literal("openai-compatible"),
  model,
  /** The API base URL. */
  url: S.NonEmptyString.annotate({ description: "The API base URL." }),
  /** The environment variable holding the API key; omitted when the server needs none. */
  apiKeyEnv: S.NonEmptyString.annotateKey({
    description: "The environment variable holding the API key; omitted when the server needs none."
  }).pipe(S.optionalKey)
}).annotate({ description: "A model served by any OpenAI-compatible API, such as a local or self-hosted server." })

/** A provider and model for free-form generation by extensions. */
export type LanguageModelSelection = typeof LanguageModelSelection.Type
export const LanguageModelSelection = S.Union([OpenAi, Anthropic, OpenRouter, OpenAiCompatibleModel])
  .annotate({ description: "A provider and model for free-form generation by extensions." })
  .pipe(S.toTaggedUnion("provider"))

/** A provider and model for trait assessments and subject matching. */
export type DecisionModelSelection = typeof DecisionModelSelection.Type
export const DecisionModelSelection = S.Union([OpenAi, OpenRouter, Cloudflare])
  .annotate({ description: "A provider and model for trait assessments and subject matching." })
  .pipe(S.toTaggedUnion("provider"))

/** The models a workspace checks traits with, kept in version control so reviewers can see which models are used. */
export type Models = typeof Models.Type
export const Models = S.Struct({
  language: LanguageModelSelection,
  decision: DecisionModelSelection
}).annotate({
  description:
    "The models a workspace checks traits with, kept in version control so reviewers can see which models are used."
})

const openAiClient = OpenAiClient.layerConfig({ apiKey: Config.Redacted("OPENAI_API_KEY") })
const anthropicClient = AnthropicClient.layerConfig({ apiKey: Config.Redacted("ANTHROPIC_API_KEY") })
const openRouterClient = OpenRouterClient.layerConfig({ apiKey: Config.Redacted("OPENROUTER_API_KEY") })
const cloudflareClient = CloudflareClient.layerConfig()
const openAiCompatibleClient = (selection: typeof OpenAiCompatibleModel.Type) =>
  OpenAiCompatible.OpenAiClient.layerConfig({
    apiUrl: Config.succeed(selection.url),
    ...(selection.apiKeyEnv === undefined ? {} : { apiKey: Config.Redacted(selection.apiKeyEnv) })
  })

/** Language and decision model services for the selected providers; credentials are read from the active ConfigProvider. */
export const layer = (models: Models) =>
  Layer.mergeAll(
    LanguageModelSelection.match(models.language, {
      openai: (selection) => OpenAiLanguageModel.layer({ model: selection.model }).pipe(Layer.provide(openAiClient)),
      anthropic: (selection) =>
        AnthropicLanguageModel.layer({ model: selection.model }).pipe(Layer.provide(anthropicClient)),
      openrouter: (selection) =>
        OpenRouterLanguageModel.layer({ model: selection.model }).pipe(Layer.provide(openRouterClient)),
      "openai-compatible": (selection) =>
        OpenAiCompatible.OpenAiLanguageModel.layer({ model: selection.model }).pipe(
          Layer.provide(openAiCompatibleClient(selection))
        )
    }),
    DecisionModelSelection.match(models.decision, {
      openai: (selection) => OpenAiDecisionModel.layer({ model: selection.model }).pipe(Layer.provide(openAiClient)),
      openrouter: (selection) =>
        OpenRouterDecisionModel.layer({ model: selection.model }).pipe(Layer.provide(openRouterClient)),
      cloudflare: (selection) =>
        CloudflareDecisionModel.layer({ model: selection.model }).pipe(Layer.provide(cloudflareClient))
    })
  )

/** Jittered exponential backoff that waits at least as long as a rate limit asks. */
const backoff: Schedule.Schedule<Duration.Duration, AiError.AiError> = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.modifyDelay((metadata: Schedule.Metadata<Duration.Duration, AiError.AiError>) =>
    Effect.succeed(
      metadata.input.retryAfter === undefined
        ? metadata.duration
        : Duration.max(metadata.duration, metadata.input.retryAfter)
    )
  )
)

/** Retries transient decision failures, such as rate limits and provider or network errors, up to five times. */
const retryTransient = <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
  Effect.retry(effect, { schedule: backoff, times: 5, while: (error) => error.isRetryable })

/** Limits simultaneous requests to the decision model in context and retries transient failures, holding the request's slot while it backs off so throttling slows the whole check instead of failing queued work. */
export const layerDecisionLimit = (concurrency: number) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    Effect.gen(function* () {
      const model = yield* DecisionModel.DecisionModel
      const semaphore = yield* Semaphore.make(concurrency)
      return DecisionModel.DecisionModel.of({
        ...model,
        decide: (definition, options) =>
          Semaphore.withPermits(semaphore, 1)(retryTransient(model.decide(definition, options))),
        decideSettled: (definition, options) =>
          Semaphore.withPermits(semaphore, 1)(retryTransient(model.decideSettled(definition, options)))
      })
    })
  )
