import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Array,
  Config,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Scope,
  String
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { TestClock } from "effect/testing"

import * as Accounts from "../Cli/Accounts.ts"
import { CliPaths } from "../Cli/CliPaths.ts"
import { AccountName } from "../Cli/Provider/AccountName.ts"
import { Credential } from "../Cli/Provider/Credential.ts"
import { ProviderAccount } from "../Cli/Provider/ProviderAccount.ts"
import * as ConfigLock from "../Cli/UserConfigLock.ts"
import { UserFileSecurity, UserFileSecurityError } from "../Cli/UserFileSecurity.ts"

const runtime = UserFileSecurity.layer.pipe(Layer.provideMerge(NodeServices.layer))
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "traits-security-" })
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
  return { fs, path, root, paths }
})

it.live(
  "enforces private file permissions or protected owner-only Windows ACLs",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { fs, path, root } = yield* fixture
        const secure = yield* UserFileSecurity
        const file = path.join(root, "private.txt")
        yield* fs.writeFileString(file, "not a secret", { mode: 0o666 })
        yield* secure(root, "Directory")
        yield* secure(file, "File")
        if (process.platform !== "win32") {
          const directoryInfo = yield* fs.stat(root)
          const fileInfo = yield* fs.stat(file)
          expect(directoryInfo.mode & 0o777).toBe(0o700)
          expect(fileInfo.mode & 0o777).toBe(0o600)
        } else {
          const systemRoot = yield* Config.String("SystemRoot")
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
          const exit = yield* spawner.exitCode(
            ChildProcess.make(
              path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
              ["-NoProfile", "-NonInteractive", "-Command", windowsAclCheck],
              { env: { TRAITS_DIRECTORY: root, TRAITS_FILE: file }, extendEnv: true }
            )
          )
          expect(exit).toBe(0)
        }
      })
    ).pipe(Effect.provide(runtime)),
  30000
)

it.live(
  "rejects hard-linked files and directory symlinks or Windows junctions",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { fs, path, root } = yield* fixture
        const secure = yield* UserFileSecurity
        const file = path.join(root, "file")
        yield* fs.writeFileString(file, "data")
        yield* fs.link(file, path.join(root, "hardlink"))
        const hardlinkError = yield* secure(file, "File").pipe(Effect.flip)
        expect(hardlinkError).toBeInstanceOf(UserFileSecurityError)
        const target = path.join(root, "target")
        const link = path.join(root, "link")
        yield* fs.makeDirectory(target)
        if (process.platform === "win32") {
          // Effect's symlink API cannot request a junction (which needs no symlink privilege on Windows).
          const { symlink } = yield* Effect.promise(() => import("node:fs/promises"))
          yield* Effect.promise(() => symlink(target, link, "junction"))
        } else {
          yield* fs.symlink(target, link)
        }
        const linkError = yield* secure(link, "Directory").pipe(Effect.flip)
        expect(linkError).toBeInstanceOf(UserFileSecurityError)
        if (process.platform === "win32") {
          yield* fs.makeDirectory(path.join(target, "nested"))
          const ancestorError = yield* secure(path.join(link, "nested"), "Directory").pipe(Effect.flip)
          expect(ancestorError).toBeInstanceOf(UserFileSecurityError)
        }
      })
    ).pipe(Effect.provide(runtime)),
  30000
)

it.live(
  "preserves caller resources and releases the lock after interruption or failure",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { paths } = yield* fixture
        const withLock = yield* ConfigLock.UserConfigLock.make.pipe(Effect.provideService(CliPaths, paths))
        const independentLock = yield* ConfigLock.UserConfigLock.make.pipe(Effect.provideService(CliPaths, paths))
        const callerScope = yield* Scope.Scope
        const observedScope = yield* Scope.Scope.pipe(
          ConfigLock.withLock,
          Effect.provideService(ConfigLock.UserConfigLock, withLock)
        )
        expect(observedScope).toBe(callerScope)
        const entered = yield* Deferred.make<void>()
        const holder = yield* Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          withLock,
          Effect.forkScoped
        )
        yield* Deferred.await(entered)
        let ran = false
        const waiter = yield* withLock(
          Effect.sync(() => {
            ran = true
          })
        ).pipe(Effect.forkScoped)
        let independentlyRan = false
        const independentWaiter = yield* independentLock(
          Effect.sync(() => {
            independentlyRan = true
          })
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep("50 millis")
        expect(ran).toBe(false)
        expect(independentlyRan).toBe(false)
        yield* Fiber.interrupt(holder)
        yield* Fiber.join(waiter)
        yield* Fiber.join(independentWaiter)
        expect(ran).toBe(true)
        expect(independentlyRan).toBe(true)
        const sentinel = { _tag: "CallerError" }
        const failure = yield* withLock(Effect.fail(sentinel)).pipe(Effect.flip)
        expect(failure).toBe(sentinel)
        yield* withLock(Effect.void)
      })
    ).pipe(Effect.provide(runtime)),
  60000
)

it.live(
  "distinguishes storage preparation failures from lock identity failures",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { fs, paths } = yield* fixture
        const withLock = yield* ConfigLock.UserConfigLock.make.pipe(Effect.provideService(CliPaths, paths))
        yield* fs.writeFileString(paths.dataDirectory, "not a directory")
        let ran = false
        const operation = Effect.sync(() => {
          ran = true
        })
        const storageError = yield* withLock(operation).pipe(Effect.flip)
        expect(storageError).toBeInstanceOf(ConfigLock.UserConfigLockStorageError)
        expect(storageError).toMatchObject({ path: paths.lock })
        if (storageError._tag === "UserConfigLockStorageError") {
          expect(storageError.cause).toBeDefined()
        }
        yield* fs.remove(paths.dataDirectory)
        const mismatchedFs = FileSystem.FileSystem.of({
          ...fs,
          lstat: (path) => fs.lstat(path).pipe(Effect.map((info) => ({ ...info, dev: info.dev + 1n })))
        })
        const mismatchedLock = yield* ConfigLock.UserConfigLock.make.pipe(
          Effect.provideService(CliPaths, paths),
          Effect.provideService(FileSystem.FileSystem, mismatchedFs)
        )
        const identityError = yield* mismatchedLock(operation).pipe(Effect.flip)
        expect(identityError).toBeInstanceOf(ConfigLock.UserConfigLockIdentityError)
        expect(identityError).toMatchObject({ path: paths.lock })
        expect(ran).toBe(false)
        yield* withLock(Effect.void)
      })
    ).pipe(Effect.provide(runtime)),
  30000
)

it.effect("reports a distinct setup/acquisition timeout without running the protected operation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { paths } = yield* fixture
      const entered = yield* Deferred.make<void>()
      const withLock = yield* ConfigLock.UserConfigLock.make.pipe(
        Effect.provideService(CliPaths, paths),
        Effect.provideService(UserFileSecurity, () =>
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
        )
      )
      let ran = false
      const waiting = yield* withLock(
        Effect.sync(() => {
          ran = true
        })
      ).pipe(Effect.flip, Effect.forkScoped)
      yield* Deferred.await(entered)
      yield* TestClock.adjust("1 minute")
      const error = yield* Fiber.join(waiting)
      expect(error).toBeInstanceOf(ConfigLock.UserConfigLockTimeoutError)
      expect(error).toMatchObject({ path: paths.lock })
      expect(error.message).toContain("do not delete the lock file")
      expect(ran).toBe(false)
    })
  ).pipe(Effect.provide(runtime))
)

it.live(
  "rejects legacy lock markers and stores credentials with fresh reads",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { fs, paths } = yield* fixture
        const withLock = yield* ConfigLock.UserConfigLock.make.pipe(Effect.provideService(CliPaths, paths))
        yield* fs.makeDirectory(paths.dataDirectory, { recursive: true })
        yield* fs.writeFileString(paths.lock, "legacy")
        const error = yield* withLock(Effect.void).pipe(Effect.flip)
        expect(error).toBeInstanceOf(ConfigLock.UserConfigLockLegacyError)
        expect(error).toMatchObject({ path: paths.lock })
        expect(error.message).toContain("legacy lock marker")
        yield* fs.writeFileString(paths.lock, "")
        yield* Effect.gen(function* () {
          const initial = yield* Accounts.read
          expect(initial).toEqual([])
          const account = ProviderAccount.make({
            id: AccountName.make("test"),
            provider: "openai",
            method: "api-key",
            credential: Credential.cases.ApiKey.make({ apiKey: Redacted.make("fake-test-key") })
          })
          yield* withLock(Accounts.write([account]))
          const saved = yield* Accounts.read
          expect(Array.map(saved, (entry) => entry.id)).toEqual([account.id])
          yield* withLock(Accounts.write([]))
          const removed = yield* Accounts.read
          expect(removed).toEqual([])
          if (process.platform !== "win32") {
            const info = yield* fs.stat(paths.accounts)
            expect(info.mode & 0o777).toBe(0o600)
            expect(Option.getOrUndefined(info.nlink)).toBe(1n)
          }
        }).pipe(Effect.provideService(CliPaths, paths))
      })
    ).pipe(Effect.provide(runtime)),
  60000
)

const windowsAclCheck = String.stripMargin(`
|$ErrorActionPreference = 'Stop'
|$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
|foreach ($path in @($env:TRAITS_DIRECTORY, $env:TRAITS_FILE)) {
|  $acl = Get-Acl -LiteralPath $path
|  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
|  if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 1 -or
|      $rules[0].IdentityReference.Value -ne $sid.Value) { exit 1 }
|}
|exit 0
`)
