import { Flag } from "effect/cli"

import { AccountName } from "../../../Provider/AccountName.ts"

export const commonFlags = {
  account: Flag.String("account").pipe(Flag.withSchema(AccountName), Flag.optional),
  keyEnv: Flag.String("key-env").pipe(
    Flag.withDescription("Read the API key from this environment variable, never from argv"),
    Flag.optional
  )
}
