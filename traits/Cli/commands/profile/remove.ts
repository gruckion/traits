import { Array, Console, Effect, Record } from "effect"
import { Argument, CliError, Command, Flag } from "effect/cli"

import { ProfileName } from "../../Profile/ProfileName.ts"
import * as UserConfig from "../../UserConfig.ts"
import { withLock } from "../../UserConfigLock.ts"

export const remove = Command.make(
  "remove",
  {
    name: Argument.String("name").pipe(Argument.withSchema(ProfileName)),
    force: Flag.Boolean("force").pipe(
      Flag.withDescription("Allow removing the default profile or clearing workspace references"),
      Flag.withDefault(false)
    )
  },
  Effect.fn("profile.remove")(
    function* (params) {
      const { name } = params
      const config = yield* UserConfig.read.pipe(
        Effect.filterOrFail(
          (config) => Array.some(config.profiles, (entry) => entry.name === name),
          () => CliError.UserError.make({ cause: `Unknown profile: ${name}` })
        )
      )
      if (
        !params.force &&
        (name === "default" || Record.some(config.workspaceProfiles, (selected) => selected === name))
      ) {
        return yield* CliError.UserError.make({
          cause: `Profile ${name} is the default profile or selected by a workspace. Use --force to remove it and clear its workspace selections.`
        })
      }
      yield* UserConfig.write({
        ...config,
        profiles: Array.filter(config.profiles, (entry) => entry.name !== name),
        workspaceProfiles: Record.filter(config.workspaceProfiles, (selected) => selected !== name)
      })
    },
    withLock,
    (effect, params) => effect.pipe(Effect.andThen(Console.log(`Removed profile ${params.name}.`)))
  )
)
