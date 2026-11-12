import { Console, Effect, Option } from "effect"
import { Command } from "effect/cli"

import * as ApiKey from "../../../_util/ApiKey.ts"
import { AccountName } from "../../../Provider/AccountName.ts"
import { Credential } from "../../../Provider/Credential.ts"
import { ProviderAccount, save } from "../../../Provider/ProviderAccount.ts"
import { withExperimentalDescription } from "../_common.ts"
import { commonFlags } from "./_common.ts"

export const anthropic = Command.make(
  "anthropic",
  commonFlags,
  Effect.fn("auth.login.anthropic")(function* (params) {
    const apiKey = yield* ApiKey.read(params.keyEnv, "Anthropic API key")
    const account = ProviderAccount.make({
      id: Option.getOrElse(params.account, () => AccountName.make("anthropic")),
      provider: "anthropic",
      method: "api-key",
      credential: Credential.cases.ApiKey.make({ apiKey })
    })
    yield* save(account)
    yield* Console.log(`Saved ${account.id} (${account.provider}). The API key has not been verified remotely.`)
  })
).pipe(withExperimentalDescription("Save an Anthropic API-key account"))
