// Opt-in live probe: consumes direct Jev API usage and the existing Codex plan allowance.
/* oxlint-disable effecttsgo/global-console, effecttsgo/process-env -- Emit only safe smoke-probe summaries; no credential values are logged. */
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"

import { Console, Effect, Schema as S } from "effect"
import { Decision, DecisionModel, LanguageModel } from "effect/ai"

import { Trait } from "../../traits/Trait.ts"
import * as DirectProviders from "./direct-providers.mjs"

const credentialsFile = process.env.MONDASH_ENV_FILE
if (credentialsFile === undefined) throw new Error("Set MONDASH_ENV_FILE to the local Mondash .env path")
const providers = await DirectProviders.load({ credentialsFile })
const results = await Effect.runPromise(
  Effect.gen(function* () {
    const decision = yield* DecisionModel.decide(
      Decision.make({
        input: S.Struct({ source: S.String }),
        decisions: {
          declaration: Decision.classify({
            instructions: "Identify the variable declaration keyword used in the supplied TypeScript source.",
            criteria: { const: "Uses const.", let: "Uses let.", var: "Uses var." }
          })
        }
      }),
      { input: { source: "const answer = 42" } }
    )
    assert.equal(decision.answers.declaration.label, "const")
    yield* Console.log("PASS direct Jev: existing Mondash credential returned a real decision")
    const generated = yield* LanguageModel.generateObject({
      prompt:
        "Return a traits array containing exactly one trait named prefer-const. Its requirement must prefer const unless reassignment is necessary. Give it a subject and purpose. No tools.",
      schema: S.Struct({ traits: S.Array(Trait) })
    })
    assert.equal(generated.value.traits.length, 1)
    assert.equal(generated.value.traits[0].name, "prefer-const")
    assert.match(generated.value.traits[0].requirement, /const/)
    yield* Console.log(
      "PASS Codex subscription: gpt-6.1-sol returned schema-validated JSON with no API-key environment"
    )
    return {
      decisionProvider: "typesafe-direct",
      configuredDecisionModel: providers.decisionModel,
      generationProvider: "codex-cli-chatgpt-login",
      generationModel: "gpt-6.1-sol",
      jevDecisionPassed: true,
      codexStructuredOutputPassed: true,
      actualTraitSchemaPassed: true,
      realAgentAppsConnected: false
    }
  }).pipe(Effect.provide(providers.layer))
)
await writeFile(new URL("./direct-results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n")
