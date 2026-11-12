import { Context, Effect, FileSystem, Layer, Path, pipe, Schema as S, Stream, String } from "effect"
import { UserDirectories } from "effect/persistence"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import * as WorkspaceLayout from "../WorkspaceLayout.ts"

/** Git could not resolve the workspace's common directory from the invocation directory. */
export class WorkspaceGitError extends S.TaggedError<WorkspaceGitError>()("WorkspaceGitError", {
  /** Invocation directory whose Git workspace lookup failed. */
  cwd: S.String.annotateKey({ description: "Invocation directory whose Git workspace lookup failed." }),
  /** Nonzero exit code returned by Git. */
  exitCode: S.Int.annotateKey({ description: "Nonzero exit code returned by Git." }),
  /** Git diagnostics explaining why repository discovery failed. */
  stderr: S.String.annotateKey({ description: "Git diagnostics explaining why repository discovery failed." })
}) {
  override get message() {
    return `Could not resolve the Git common directory from ${this.cwd} (git exited with ${this.exitCode}): ${this.stderr}`
  }
}

/** Workspace and user-level filesystem locations used by the local CLI. */
export class CliPaths extends Context.Service<CliPaths>()("traits/Cli/CliPaths", {
  make: Effect.gen(function* () {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const cwd = path.resolve()
    const canonicalCwd = yield* fs.realPath(cwd)
    const workspaceKey = yield* Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
          cwd,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: { LC_ALL: "C" },
          extendEnv: true
        })
      )
      const { exitCode, stdout, stderr } = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
          stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString)
        },
        { concurrency: "unbounded" }
      )
      if (exitCode === 128 && stderr.startsWith("fatal: not a git repository (or any ")) {
        return canonicalCwd
      }
      if (exitCode !== 0) {
        return yield* WorkspaceGitError.make({ cwd, exitCode, stderr: String.trim(stderr) })
      }
      return yield* pipe(stdout, String.trim, S.decodeEffect(S.NonEmptyString), Effect.flatMap(fs.realPath))
    }).pipe(Effect.scoped)
    const traitsDirectory = path.join(cwd, WorkspaceLayout.directory)
    const { config, data } = yield* UserDirectories.UserDirectories
    const { configDirectory, dataDirectory } = yield* Effect.all(
      {
        configDirectory: config("traits"),
        dataDirectory: data("traits")
      },
      { concurrency: "unbounded" }
    )
    return {
      /** Absolute invocation directory, without resolving symlinks. */
      cwd,
      /** Profile-selection key: canonical Git common directory shared by worktrees, or canonical cwd outside Git. */
      workspaceKey,
      /** Local trait definitions directory at cwd/.agents/traits. */
      traitsDirectory,
      /** Named environment configurations at cwd/.agents/traits/_environments. */
      environmentsDirectory: path.join(cwd, WorkspaceLayout.environments),
      /** Platform-native user configuration directory for traits. */
      configDirectory,
      /** Platform-native user data directory for traits. */
      dataDirectory,
      /** User-level profiles.json file containing profiles and workspace overrides. */
      config: path.join(configDirectory, "profiles.json"),
      /** User-level credentials.json file containing saved provider accounts and secrets. */
      accounts: path.join(dataDirectory, "credentials.json"),
      /** Persistent cli.lock file used for native locking; never unlink or replace it. */
      lock: path.join(dataDirectory, "cli.lock")
    }
  })
}) {
  static readonly layer = this.make.pipe(Layer.effect(this))
}
