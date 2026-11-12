import { Effect, FileSystem, pipe, Schema as S } from "effect"
import { CliError } from "effect/cli"

import * as AtomicFile from "./_util/AtomicFile.ts"
import { CliPaths } from "./CliPaths.ts"
import { ProviderAccount } from "./Provider/ProviderAccount.ts"
import { UserFileSecurity } from "./UserFileSecurity.ts"

/** The provider accounts file could not be decoded or encoded; the schema cause is dropped so credential values are not retained. */
class InvalidAccountsError extends S.TaggedError<InvalidAccountsError>()("InvalidAccountsError", {
  /** Path of the owner-only provider accounts file. */
  path: S.String.annotateKey({ description: "Path of the owner-only provider accounts file." })
}) {
  override get message() {
    return `Invalid provider accounts: ${this.path}`
  }
}

/** Reads fresh accounts from owner-only storage without exposing credential parsing inputs. */
export const read = Effect.gen(function* () {
  const { accounts, dataDirectory } = yield* CliPaths
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(accounts))) {
    return []
  }
  const secure = yield* UserFileSecurity
  yield* secure(dataDirectory, "Directory")
  yield* secure(accounts, "File")
  const text = yield* fs.readFileString(accounts)
  return yield* pipe(
    text,
    S.decodeEffect(S.fromJsonString(S.Array(ProviderAccount))),
    Effect.mapError(() => InvalidAccountsError.make({ path: accounts }))
  )
}).pipe(
  Effect.catch((cause) =>
    CliPaths.use((paths) =>
      CliError.UserError.make({
        cause,
        userMessage: `Could not read provider accounts from ${paths.accounts}. Check the file format, ownership, and permissions.`
      })
    )
  ),
  Effect.withSpan("Accounts.read")
)

/** Replaces all saved accounts; coordinate read-modify-write operations with UserConfigLock. */
export const write = Effect.fn("Accounts.write")(
  function* (saved: ReadonlyArray<ProviderAccount>) {
    const { accounts, dataDirectory } = yield* CliPaths
    const fs = yield* FileSystem.FileSystem
    const secure = yield* UserFileSecurity
    yield* fs.makeDirectory(dataDirectory, { recursive: true, mode: 0o700 })
    yield* secure(dataDirectory, "Directory")
    const text = yield* pipe(
      saved,
      S.encodeEffect(S.fromJsonString(S.Array(ProviderAccount))),
      Effect.mapError(() => InvalidAccountsError.make({ path: accounts }))
    )
    yield* AtomicFile.write(accounts, text)
  },
  Effect.catch((cause) =>
    CliPaths.use((paths) =>
      CliError.UserError.make({
        cause,
        userMessage: `Could not save provider accounts to ${paths.accounts}. Check directory ownership, permissions, and available disk space.`
      })
    )
  )
)
