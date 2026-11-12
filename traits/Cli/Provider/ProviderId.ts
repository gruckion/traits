import { Schema as S } from "effect"

/** A supported source of model access. */
export type ProviderId = typeof ProviderId.Type
export const ProviderId = S.Literals([
  "anthropic",
  "cloudflare-workers-ai",
  "openai",
  "openrouter",
  "typesafe-ai"
]).annotate({
  description: "A supported source of model access."
})
