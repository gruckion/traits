import { Array, Effect, FileSystem, Option, pipe, Schema as S } from "effect"
import { CliError } from "effect/cli"

import * as AtomicFile from "./_util/AtomicFile.ts"
import { CliPaths } from "./CliPaths.ts"
import { Profile, ProfileName } from "./Profile/Profile.ts"

/** User-level profiles and workspace overrides; the profile named default is the fallback. Contains no credentials. */
export type UserConfig = typeof UserConfig.Type
export const UserConfig = S.Struct({
  profiles: S.Array(S.Struct({ name: ProfileName, profile: Profile })),
  /** Profile overrides keyed by canonical Git common directory, or canonical cwd outside Git. */
  workspaceProfiles: S.Record(S.NonEmptyString.check(S.isTrimmed()), ProfileName)
    .pipe(S.withDecodingDefaultKey(Effect.succeed({})))
    .annotateKey({
      description: "Profile overrides keyed by canonical Git common directory, or canonical cwd outside Git."
    })
}).annotate({
  description:
    "User-level profiles and workspace overrides; the profile named default is the fallback. Contains no credentials."
})

/** Reads fresh profile settings; missing configuration is empty. */
export const read = Effect.gen(function* () {
  const { config } = yield* CliPaths
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(config))) {
    return UserConfig.make({ profiles: [], workspaceProfiles: {} })
  }
  const text = yield* fs.readFileString(config)
  return yield* pipe(text, S.decodeEffect(S.fromJsonString(UserConfig)))
}).pipe(
  Effect.catch((cause) =>
    CliPaths.use((paths) =>
      CliError.UserError.make({
        cause,
        userMessage: `Could not read profiles from ${paths.config}. Check that the file is readable and contains valid profile JSON.`
      })
    )
  ),
  Effect.withSpan("UserConfig.read")
)

/** Replaces the complete configuration; coordinate read-modify-write operations with UserConfigLock. */
export const write = Effect.fn("UserConfig.write")(
  function* (saved: UserConfig) {
    const { config } = yield* CliPaths
    const text = yield* pipe(saved, S.encodeEffect(S.fromJsonString(UserConfig)))
    yield* AtomicFile.write(config, text)
  },
  Effect.catch((cause) =>
    CliPaths.use((paths) =>
      CliError.UserError.make({
        cause,
        userMessage: `Could not save profiles to ${paths.config}. Check directory ownership, permissions, and available disk space.`
      })
    )
  )
)

/** Resolves an explicit name, workspace override, or the profile named default; missing profiles fail. */
export const resolveProfile = Effect.fn("UserConfig.resolveProfile")(function* (
  config: UserConfig,
  explicitName?: ProfileName
) {
  let selected = explicitName
  if (selected === undefined) {
    const { workspaceKey } = yield* CliPaths
    selected = config.workspaceProfiles[workspaceKey] ?? ProfileName.make("default")
  }
  return yield* Array.findFirst(config.profiles, (entry) => entry.name === selected).pipe(
    Option.match({
      onSome: Effect.succeed,
      onNone: () =>
        CliError.UserError.make({
          cause: `Selected profile ${selected} does not exist. Create it with traits profile create ${selected}, or select an existing workspace profile with traits profile use <name>.`
        })
    })
  )
})
