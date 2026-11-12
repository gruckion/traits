import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Array, Effect, FileSystem, Layer, Path, Redacted } from "effect"
import { CliError } from "effect/cli"

import * as Accounts from "../Cli/Accounts.ts"
import { CliPaths } from "../Cli/CliPaths.ts"
import { AccountName } from "../Cli/Provider/AccountName.ts"
import { Credential } from "../Cli/Provider/Credential.ts"
import { ProviderAccount, save } from "../Cli/Provider/ProviderAccount.ts"
import { ProviderId } from "../Cli/Provider/ProviderId.ts"
import { UserConfigLock } from "../Cli/UserConfigLock.ts"
import { UserFileSecurity } from "../Cli/UserFileSecurity.ts"

const account = (provider: ProviderId, key: string, name = "primary") =>
  ProviderAccount.make({
    id: AccountName.make(name),
    provider,
    method: "api-key",
    credential: Credential.cases.ApiKey.make({ apiKey: Redacted.make(key) })
  })

const runtime = UserFileSecurity.layer.pipe(Layer.provideMerge(NodeServices.layer))
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "traits-account-save-" })
  const paths = CliPaths.of({
    cwd: root,
    workspaceKey: root,
    traitsDirectory: path.join(root, ".agents", "traits"),
    environmentsDirectory: path.join(root, ".agents", "traits", "_environments"),
    configDirectory: path.join(root, "config"),
    dataDirectory: path.join(root, "data"),
    config: path.join(root, "config", "profiles.json"),
    accounts: path.join(root, "data", "credentials.json"),
    lock: path.join(root, "data", "cli.lock")
  })
  const original = account("openai", "fake-original-key")
  yield* Accounts.write([original]).pipe(Effect.provideService(CliPaths, paths))
  const withLock = yield* UserConfigLock.make.pipe(Effect.provideService(CliPaths, paths))
  return { original, paths, withLock }
})

it.live(
  "rejects changing an account's provider without writing credentials",
  Effect.fnUntraced(function* () {
    const { original, paths, withLock } = yield* fixture
    const fs = yield* FileSystem.FileSystem
    const before = yield* fs.readFileString(paths.accounts)
    yield* Effect.gen(function* () {
      const error = yield* save(account("openrouter", "fake-new-key")).pipe(Effect.flip)
      expect(error).toBeInstanceOf(CliError.UserError)
      const saved = yield* Accounts.read
      expect(saved).toEqual([original])
      const after = yield* fs.readFileString(paths.accounts)
      expect(after).toBe(before)
    }).pipe(Effect.provideService(CliPaths, paths), Effect.provideService(UserConfigLock, withLock))
  }, Effect.provide(runtime)),
  60000
)

it.live(
  "updates the same provider's key and permits a different provider under a new name",
  Effect.fnUntraced(function* () {
    const { paths, withLock } = yield* fixture
    const updated = account("openai", "fake-updated-key")
    const separate = account("openrouter", "fake-other-key", "router")
    yield* Effect.gen(function* () {
      yield* save(updated)
      yield* save(separate)
      const saved = yield* Accounts.read
      expect(saved).toEqual([updated, separate])
      expect(
        Array.map(saved, (entry) =>
          Credential.guards.ApiKey(entry.credential) ? Redacted.value(entry.credential.apiKey) : undefined
        )
      ).toEqual(["fake-updated-key", "fake-other-key"])
    }).pipe(Effect.provideService(CliPaths, paths), Effect.provideService(UserConfigLock, withLock))
  }, Effect.provide(runtime)),
  60000
)
