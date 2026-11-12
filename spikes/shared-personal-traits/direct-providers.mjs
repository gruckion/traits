// Reads only the selected Jev settings from an explicitly supplied local env file.
/* oxlint-disable effecttsgo/async-function -- Credential discovery is isolated native startup code; no values are logged or persisted. */
import { readFile } from "node:fs/promises"
import { parseEnv } from "node:util"

import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import { Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"

import * as CodexLanguageModel from "./codex-language-model.mjs"

export const load = async ({ credentialsFile, model = "gpt-6.1-sol" }) => {
  const settings = parseEnv(await readFile(credentialsFile, "utf8"))
  if (
    typeof settings.TYPESAFE_API_KEY !== "string" ||
    settings.TYPESAFE_API_KEY.length === 0 ||
    typeof settings.TYPESAFE_MODEL !== "string" ||
    settings.TYPESAFE_MODEL.length === 0
  )
    throw new Error("Jev key/model are missing from the selected local environment")
  const client = TypeSafeClient.layer({ apiKey: Redacted.make(settings.TYPESAFE_API_KEY) }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )
  return {
    decisionModel: settings.TYPESAFE_MODEL,
    layer: Layer.mergeAll(
      TypeSafeDecisionModel.layer({ model: settings.TYPESAFE_MODEL }).pipe(Layer.provide(client)),
      CodexLanguageModel.layer({ model })
    )
  }
}
