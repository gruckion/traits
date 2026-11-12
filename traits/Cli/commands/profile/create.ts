import { Array, Console, Effect, FileSystem, Path } from "effect"
import { Argument, CliError, Command, Flag } from "effect/cli"

import * as Accounts from "../../Accounts.ts"
import { ModelSelection, ModelSelectionFromString } from "../../Profile/ModelSelection.ts"
import { Profile } from "../../Profile/Profile.ts"
import { ProfileName } from "../../Profile/ProfileName.ts"
import * as UserConfig from "../../UserConfig.ts"
import { withLock } from "../../UserConfigLock.ts"

const selectionFlag = (role: string) =>
  Flag.String(role).pipe(
    Flag.withDescription(
      "Account/model reference or custom .ts layer file (use ./, ../, or an absolute path for directories)"
    ),
    Flag.withSchema(ModelSelectionFromString),
    Flag.mapEffect(
      Effect.fn("profile.modelSelection")(function* (selection) {
        if (ModelSelection.guards.Custom(selection)) {
          const path = yield* Path.Path
          const fs = yield* FileSystem.FileSystem
          const filename = path.resolve(selection.path)
          yield* fs.stat(filename).pipe(
            Effect.catchTags({
              PlatformError: () =>
                CliError.UserError.make({ cause: `Cannot access custom model layer file: ${filename}` })
            }),
            Effect.filterOrFail(
              (info) => info.type === "File",
              () => CliError.UserError.make({ cause: `Custom model layer path is not a file: ${filename}` })
            )
          )
          return ModelSelection.cases.Custom.make({ path: filename })
        }
        return selection
      })
    )
  )

export const create = Command.make(
  "create",
  {
    name: Argument.String("name").pipe(Argument.withSchema(ProfileName)),
    language: selectionFlag("language"),
    decision: selectionFlag("decision"),
    replace: Flag.Boolean("replace").pipe(Flag.withDefault(false))
  },
  Effect.fn("profile.create")(
    function* (params) {
      const { name, language, decision, replace } = params
      const profile = Profile.make({ language, decision })
      const providerSelections = Array.filter([language, decision], ModelSelection.guards.Provider)
      const config = yield* UserConfig.read.pipe(
        Effect.filterOrFail(
          (config) => replace || !Array.some(config.profiles, (entry) => entry.name === name),
          () => CliError.UserError.make({ cause: `Profile ${name} already exists. Use --replace to overwrite it.` })
        )
      )
      if (providerSelections.length > 0) {
        const accounts = yield* Accounts.read
        for (const selection of providerSelections) {
          if (!Array.some(accounts, (account) => account.id === selection.account)) {
            return yield* CliError.UserError.make({
              cause: `Unknown account: ${selection.account}. Run traits auth login first.`
            })
          }
        }
      }
      yield* UserConfig.write({
        ...config,
        profiles: [...Array.filter(config.profiles, (entry) => entry.name !== name), { name, profile }]
      })
    },
    withLock,
    (effect, params) =>
      effect.pipe(
        Effect.andThen(
          Console.log(
            `Saved profile ${params.name}. Model availability and role capabilities are checked when models are resolved.`
          )
        )
      )
  )
)
