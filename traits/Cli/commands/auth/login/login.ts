import { Command } from "effect/cli"

import { withExperimentalDescription } from "../_common.ts"
import { anthropic } from "./anthropic.ts"
import { cloudflareWorkersAi } from "./cloudflare-workers-ai.ts"
import { openai } from "./openai.ts"
import { openrouter } from "./openrouter.ts"
import { typesafeAi } from "./typesafe-ai.ts"

export const login = Command.make("login").pipe(
  withExperimentalDescription("Save a provider account; OAuth is not implemented yet"),
  Command.withSubcommands([anthropic, cloudflareWorkersAi, openai, openrouter, typesafeAi])
)
