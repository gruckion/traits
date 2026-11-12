import { Console, Effect, Option, Schema as S } from "effect"
import { Command, Flag } from "effect/cli"

import * as ApiKey from "../../../_util/ApiKey.ts"
import { AccountName } from "../../../Provider/AccountName.ts"
import { Credential } from "../../../Provider/Credential.ts"
import { ProviderAccount, save } from "../../../Provider/ProviderAccount.ts"
import { withExperimentalDescription } from "../_common.ts"
import { commonFlags } from "./_common.ts"

export const cloudflareWorkersAi = Command.make(
  "cloudflare-workers-ai",
  {
    ...commonFlags,
    accountId: Flag.String("account-id").pipe(
      Flag.withDescription("Cloudflare account ID (32 hexadecimal characters)"),
      Flag.withSchema(S.String.check(S.isPattern(/^[a-f0-9]{32}$/iu)))
    )
  },
  Effect.fn("auth.login.cloudflareWorkersAi")(function* (params) {
    const apiKey = yield* ApiKey.read(params.keyEnv, "Cloudflare API token")
    const account = ProviderAccount.make({
      id: Option.getOrElse(params.account, () => AccountName.make("cloudflare-workers-ai")),
      provider: "cloudflare-workers-ai",
      method: "api-key",
      credential: Credential.cases.ApiKey.make({ apiKey }),
      settings: { accountId: params.accountId }
    })
    yield* save(account)
    yield* Console.log(`Saved ${account.id} (${account.provider}). The API key has not been verified remotely.`)
  })
).pipe(withExperimentalDescription("Save a Cloudflare Workers AI API-token account"))
