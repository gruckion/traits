import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError } from "effect"
import { UserDirectories } from "effect/persistence"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { CliPaths, WorkspaceGitError } from "../Cli/CliPaths.ts"

it.live("shares a canonical profile key across linked worktrees and resolves it only during layer construction", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "traits-workspace-key-" })
      const repository = path.join(temporary, "repository")
      const worktree = path.join(temporary, "worktree")
      const outside = path.join(temporary, "outside")
      const bare = path.join(temporary, "bare.git")
      const git = Effect.fn("test.git")(function* (args: ReadonlyArray<string>) {
        const code = yield* spawner.exitCode(
          ChildProcess.make("git", args, {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "pipe"
          })
        )
        expect(code).toBe(0)
      })
      yield* git(["init", "--quiet", repository])
      yield* git(["init", "--quiet", "--bare", bare])
      yield* git([
        "-C",
        repository,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "initial"
      ])
      yield* git(["-C", repository, "worktree", "add", "--quiet", "--detach", worktree])
      const nested = path.join(worktree, "nested")
      yield* fs.makeDirectory(path.join(nested, ".agents", "traits"), { recursive: true })
      yield* fs.makeDirectory(path.join(outside, ".agents", "traits"), { recursive: true })
      const commonDirectory = yield* fs.realPath(path.join(repository, ".git"))
      const outsideKey = yield* fs.realPath(outside)
      const bareKey = yield* fs.realPath(bare)
      for (const cwd of [repository, worktree, nested, outside, bare]) {
        let canonicalizations = 0
        let gitQueries = 0
        const trackedFs = FileSystem.FileSystem.of({
          ...fs,
          realPath: (input) =>
            Effect.suspend(() => {
              canonicalizations++
              return fs.realPath(input)
            })
        })
        const trackedSpawner = ChildProcessSpawner.ChildProcessSpawner.of({
          ...spawner,
          spawn: (command) =>
            Effect.suspend(() => {
              gitQueries++
              return spawner.spawn(command)
            })
        })
        yield* Effect.gen(function* () {
          const first = yield* CliPaths
          const expected = cwd === outside ? outsideKey : cwd === bare ? bareKey : commonDirectory
          expect(first.workspaceKey).toBe(expected)
          expect(first.cwd).toBe(cwd)
          const callsAfterConstruction = canonicalizations
          expect(callsAfterConstruction).toBe(cwd === outside ? 1 : 2)
          expect(gitQueries).toBe(1)
          const second = yield* CliPaths
          expect(second).toBe(first)
          expect(canonicalizations).toBe(callsAfterConstruction)
          expect(gitQueries).toBe(1)
        }).pipe(
          Effect.provide(CliPaths.layer.pipe(Layer.provide(UserDirectories.layer))),
          Effect.provideService(FileSystem.FileSystem, trackedFs),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, trackedSpawner),
          Effect.provideService(Path.Path, Path.Path.of({ ...path, resolve: () => cwd }))
        )
      }
    })
  ).pipe(Effect.provide(NodeServices.layer))
)

it.live("does not fall back to cwd for invalid Git metadata or process-spawn failures", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "traits-invalid-git-" })
      yield* fs.writeFileString(path.join(cwd, ".git"), "gitdir: missing\n")
      const lookup = CliPaths.make.pipe(
        Effect.provide(UserDirectories.layer),
        Effect.provideService(Path.Path, Path.Path.of({ ...path, resolve: () => cwd }))
      )
      const error = yield* lookup.pipe(Effect.flip)
      expect(error).toBeInstanceOf(WorkspaceGitError)
      expect(error).toMatchObject({ cwd, exitCode: 128 })
      const missingGit = PlatformError.systemError({
        _tag: "NotFound",
        module: "ChildProcess",
        method: "spawn",
        pathOrDescriptor: "git"
      })
      const failure = yield* lookup.pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, {
          ...spawner,
          spawn: () => missingGit
        }),
        Effect.flip
      )
      expect(failure).toBe(missingGit)
    })
  ).pipe(Effect.provide(NodeServices.layer))
)
