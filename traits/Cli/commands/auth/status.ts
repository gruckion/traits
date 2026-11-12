import { Array, Console, Effect, Option } from "effect"
import { CliError, Command, Flag } from "effect/cli"

import * as Accounts from "../../Accounts.ts"
import { AccountName } from "../../Provider/AccountName.ts"
import { withExperimentalDescription } from "./_common.ts"

export const status = Command.make(
  "status",
  {
    account: Flag.String("account").pipe(Flag.withSchema(AccountName), Flag.optional)
  },
  Effect.fn("auth.status")(function* (params) {
    const account = Option.getOrUndefined(params.account)
    const accounts = yield* Accounts.read
    const selected = account !== undefined ? Array.filter(accounts, (entry) => entry.id === account) : accounts
    if (account !== undefined && selected.length === 0) {
      return yield* CliError.UserError.make({ cause: `Unknown account: ${account}` })
    }
    if (selected.length === 0) {
      return yield* Console.log("No saved accounts.")
    }
    for (const entry of selected)
      yield* Console.log(`${entry.id}: configured (${entry.provider}); remote access not verified`)
  })
).pipe(withExperimentalDescription("Show which saved accounts are configured; remote access is not verified"))
