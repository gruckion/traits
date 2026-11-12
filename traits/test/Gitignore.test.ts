import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { CliPaths } from "../Cli/CliPaths.ts"
import { GitignoreError, match } from "../Cli/Gitignore.ts"

const repository = Layer.effect(
  CliPaths,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "traits-gitignore-" })
    const exit = yield* ChildProcess.make("git", ["init", "--quiet"], {
      cwd,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    }).pipe(spawner.exitCode)
    expect(exit).toBe(0)
    return CliPaths.of({
      cwd,
      workspaceKey: path.join(cwd, ".git"),
      traitsDirectory: path.join(cwd, ".agents", "traits"),
      environmentsDirectory: path.join(cwd, ".agents", "traits", "_environments"),
      configDirectory: path.join(cwd, "config"),
      dataDirectory: path.join(cwd, "data"),
      config: path.join(cwd, "config", "profiles.json"),
      accounts: path.join(cwd, "data", "credentials.json"),
      lock: path.join(cwd, "data", "cli.lock")
    })
  })
)
const runtime = repository.pipe(Layer.provideMerge(NodeServices.layer))

it.live(
  "honors Git ignore rules, negation, excludes, literal paths, and tracked files",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const { cwd } = yield* CliPaths
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    yield* fs.writeFileString(
      path.join(cwd, ".gitignore"),
      "*.log\n!keep.log\nignored/\n-leading.txt\n:(literal).txt\n"
    )
    yield* fs.makeDirectory(path.join(cwd, "nested"))
    yield* fs.writeFileString(path.join(cwd, "nested", ".gitignore"), "*.tmp\n!keep.tmp\n")
    yield* fs.writeFileString(path.join(cwd, ".git", "info", "exclude"), "local-only.txt\n")
    yield* fs.writeFileString(path.join(cwd, "global-ignore"), "global-only.txt\n")
    const configured = yield* ChildProcess.make(
      "git",
      ["config", "core.excludesFile", path.join(cwd, "global-ignore")],
      {
        cwd,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore"
      }
    ).pipe(spawner.exitCode)
    expect(configured).toBe(0)
    yield* fs.writeFileString(path.join(cwd, "tracked.log"), "tracked")
    const added = yield* ChildProcess.make("git", ["add", "--force", "--", "tracked.log"], {
      cwd,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    }).pipe(spawner.exitCode)
    expect(added).toBe(0)
    const ignored = yield* Effect.forEach(
      [
        "new.log",
        "keep.log",
        "ordinary.txt",
        "ignored/new.txt",
        "nested/new.tmp",
        "nested/keep.tmp",
        "local-only.txt",
        "global-only.txt",
        "-leading.txt",
        ":(literal).txt",
        "tracked.log",
        path.join(cwd, "absolute.log")
      ],
      match,
      { concurrency: "unbounded" }
    )
    expect(ignored).toEqual([true, false, false, true, true, false, true, true, true, true, false, true])
  }, Effect.provide(runtime))
)

it.live(
  "fails rather than returning false for paths outside the repository or a non-repository cwd",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const workspace = yield* CliPaths
    const outside = yield* fs.makeTempDirectoryScoped({ prefix: "traits-not-repository-" })
    const outsidePath = path.join(outside, "file.txt")
    const outsideError = yield* match(outsidePath).pipe(Effect.flip)
    expect(outsideError).toBeInstanceOf(GitignoreError)
    expect(outsideError).toMatchObject({ path: outsidePath })
    const repositoryError = yield* match("file.txt").pipe(
      Effect.provideService(CliPaths, CliPaths.of({ ...workspace, cwd: outside })),
      Effect.flip
    )
    expect(repositoryError).toBeInstanceOf(GitignoreError)
  }, Effect.provide(runtime))
)
