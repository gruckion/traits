import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Array, Effect, FileSystem, Path, pipe, Runtime, Schema as S, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { VerdictExit } from "../Cli/commands/check/check.ts"
import { ModelSelection } from "../Cli/Profile/ModelSelection.ts"
import { Profile } from "../Cli/Profile/Profile.ts"

const runCli = Effect.fn("test.runCli")(function* (
  args: ReadonlyArray<string>,
  env: Record<string, string>,
  blockNativeLock: boolean = false,
  cwd?: string
) {
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(
    ChildProcess.make(
      process.execPath,
      [
        ...(blockNativeLock ? ["--import", nativeLockFailureHook] : []),
        path.resolve(import.meta.dirname, "..", "main.ts"),
        ...args
      ],
      { env, extendEnv: true, stdin: "ignore", cwd: cwd ?? path.resolve() }
    )
  )
  return yield* Effect.all(
    {
      code: handle.exitCode,
      stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString)
    },
    { concurrency: "unbounded" }
  )
})

it.live(
  "renders help and version without user directories, Windows configuration, or the native lock addon",
  Effect.fnUntraced(function* () {
    const env = {
      HOME: "",
      USERPROFILE: "",
      APPDATA: "",
      LOCALAPPDATA: "",
      SystemRoot: "",
      XDG_CONFIG_HOME: "",
      XDG_DATA_HOME: ""
    }
    for (const args of [
      ["--help"],
      ["--version"],
      ["auth", "--help"],
      ["auth", "login", "openai", "--help"],
      ["profile", "create", "--help"],
      ["check", "--help"],
      ["mcp", "--help"],
      ["update", "--help"]
    ]) {
      const result = yield* runCli(args, env, true)
      expect(result.code).toBe(0)
      expect(String.trim(result.stdout).length).toBeGreaterThan(0)
      expect(result.stderr).not.toContain("TEST_NATIVE_LOCK_UNAVAILABLE")
    }
  }, Effect.provide(NodeServices.layer)),
  60000
)

it.live(
  "only loads the native lock addon when a command acquires the lock",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "traits-cli-startup-" })
    const env = {
      HOME: root,
      USERPROFILE: root,
      APPDATA: path.join(root, "config"),
      LOCALAPPDATA: path.join(root, "data"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      TRAITS_TEST_KEY: "fake-startup-key"
    }
    for (const args of [
      ["auth", "list"],
      ["auth", "status"],
      ["profile", "list"]
    ]) {
      const result = yield* runCli(args, env, true)
      expect(result.code).toBe(0)
    }
    const write = yield* runCli(["auth", "login", "openai", "--key-env", "TRAITS_TEST_KEY"], env, true)
    expect(write.code).not.toBe(0)
    expect(write.stdout + write.stderr).toContain("TEST_NATIVE_LOCK_UNAVAILABLE")
    expect(write.stdout + write.stderr).not.toContain(env.TRAITS_TEST_KEY)
  }, Effect.provide(NodeServices.layer)),
  60000
)

it.live(
  "renders storage and key-environment failures without stacks or credential contents",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "traits-cli-errors-" })
    const env = {
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      TRAITS_TEST_MISSING_KEY: "",
      TRAITS_TEST_BLANK_KEY: "   "
    }
    const configDirectory = path.join(env.XDG_CONFIG_HOME, "traits")
    const dataDirectory = path.join(env.XDG_DATA_HOME, "traits")
    yield* fs.makeDirectory(configDirectory, { recursive: true })
    yield* fs.makeDirectory(dataDirectory, { recursive: true })
    yield* fs.writeFileString(path.join(configDirectory, "profiles.json"), "{broken")
    yield* fs.writeFileString(path.join(dataDirectory, "credentials.json"), '{"apiKey":"DO_NOT_PRINT_TEST_SECRET"}')
    for (const args of [
      ["profile", "list"],
      ["auth", "list"],
      ["auth", "login", "openai", "--key-env", "TRAITS_TEST_MISSING_KEY"],
      ["auth", "login", "openai", "--key-env", "TRAITS_TEST_BLANK_KEY"]
    ]) {
      const result = yield* runCli(args, env)
      const output = result.stdout + result.stderr
      expect(result.code).not.toBe(0)
      expect(output).not.toContain("\n    at ")
      expect(output).not.toContain("SchemaError")
      expect(output).not.toContain("DO_NOT_PRINT_TEST_SECRET")
      if (args[0] === "profile") {
        expect(output).toContain("Could not read profiles")
        expect(output).toContain("profiles.json")
      } else if (args[1] === "list") {
        expect(output).toContain("Could not read provider accounts")
        expect(output).toContain("credentials.json")
      } else if (args[4] === "TRAITS_TEST_MISSING_KEY") {
        expect(output).toContain("TRAITS_TEST_MISSING_KEY")
      } else {
        expect(output).toContain("An API key is required")
      }
    }
  }, Effect.provide(NodeServices.layer)),
  60000
)

it.live(
  "stores custom layer paths without reading credentials or executing the modules",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "traits-custom-profile-" })
    const env = { XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data") }
    const module = path.join(root, "custom layer.ts")
    yield* fs.writeFileString(
      module,
      'throw new Error("PROFILE_MANAGEMENT_MUST_NOT_IMPORT_THIS"); export default undefined;'
    )
    const data = path.join(env.XDG_DATA_HOME, "traits")
    yield* fs.makeDirectory(data, { recursive: true })
    yield* fs.writeFileString(path.join(data, "credentials.json"), "not valid JSON")
    const created = yield* runCli(["profile", "create", "custom", "--language", module, "--decision", module], env)
    expect(created.code).toBe(0)
    const shown = yield* runCli(["profile", "show", "custom"], env)
    expect(shown.code).toBe(0)
    const saved = yield* pipe(shown.stdout, S.decodeEffect(S.fromJsonString(S.Struct({ profile: Profile }))))
    for (const selection of [saved.profile.language, saved.profile.decision]) {
      expect(selection).toEqual(ModelSelection.cases.Custom.make({ path: module }))
    }
    const removed = yield* runCli(["profile", "remove", "custom"], env)
    expect(removed.code).toBe(0)
  }, Effect.provide(NodeServices.layer)),
  60000
)

const nativeLockFailureScript = String.stripMargin(`
|import { registerHooks } from "node:module";
|registerHooks({
|  resolve: (specifier, context, next) => {
|    if (specifier === "fs-native-extensions") {
|      throw new Error("TEST_NATIVE_LOCK_UNAVAILABLE");
|    }
|    return next(specifier, context);
|  }
|});
`)
const nativeLockFailureHook = `data:text/javascript,${encodeURIComponent(nativeLockFailureScript)}`

it.live(
  "reports check failures on stderr with the Incomplete exit code and maps verdicts to exit codes",
  Effect.fnUntraced(
    function* () {
      const fs = yield* FileSystem.FileSystem
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "traits-check-exit-" })
      const missing = yield* runCli(["check", "src/a.ts"], {}, false, cwd)
      expect(missing).toMatchObject({ code: 2, stdout: "" })
      expect(missing.stderr).toContain(".agents/traits/_traits.json")
      expect(missing.stderr).not.toContain("    at ")
      const partialPolicy = yield* runCli(["check", "--fail", "0.5", "src/a.ts"], {}, false, cwd)
      expect(partialPolicy).toMatchObject({ code: 2, stdout: "" })
      expect(partialPolicy.stderr).toContain("--fail and --pass")
      expect(
        pipe(
          ["Pass", "Fail", "Incomplete", "Inconclusive"] as const,
          Array.map((verdict) => Runtime.getErrorExitCode(VerdictExit.make({ verdict })))
        )
      ).toEqual([0, 1, 2, 3])
    },
    Effect.scoped,
    Effect.provide(NodeServices.layer)
  )
)
