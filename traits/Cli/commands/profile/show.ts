import { Console, Effect, Option } from "effect"
import { Argument, Command } from "effect/cli"

import { ProfileName } from "../../Profile/ProfileName.ts"
import * as UserConfig from "../../UserConfig.ts"

export const show = Command.make(
  "show",
  {
    name: Argument.String("name").pipe(Argument.withSchema(ProfileName), Argument.optional)
  },
  Effect.fn("profile.show")(function* (params) {
    const config = yield* UserConfig.read
    const entry = yield* UserConfig.resolveProfile(config, Option.getOrUndefined(params.name))
    yield* Console.log(JSON.stringify(entry, null, 2))
  })
)
