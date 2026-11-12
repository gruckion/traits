import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, FileSystem, Layer, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import * as WorkspaceConfigProvider from "../WorkspaceConfigProvider.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"

const load = (directory: string, key: string) =>
  ConfigProvider.ConfigProvider.pipe(
    Effect.flatMap((provider) => provider.load([key])),
    Effect.map((node) => node?.value),
    Effect.provide(WorkspaceConfigProvider.layer.pipe(Layer.provide(WorkspaceRoot.layer(directory))))
  )

it.live("falls back from the workspace's .env to the main checkout's .env for linked worktrees", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const parent = yield* fs.makeTempDirectoryScoped({ prefix: "traits-config-provider-" })
    const main = path.join(parent, "main")
    const worktree = path.join(parent, "worktree")
    const outside = path.join(parent, "outside")
    yield* fs.makeDirectory(main)
    yield* fs.makeDirectory(outside)
    const git = (...args: ReadonlyArray<string>) =>
      ChildProcess.make(
        "git",
        ["-c", "user.name=traits", "-c", "user.email=traits@example.com", "-c", "commit.gpgsign=false", ...args],
        { cwd: main, stdin: "ignore", stdout: "ignore", stderr: "ignore" }
      ).pipe(spawner.exitCode)
    const init = yield* git("init", "--quiet")
    expect(init).toBe(0)
    const commit = yield* git("commit", "--quiet", "--allow-empty", "-m", "initial")
    expect(commit).toBe(0)
    const worktreeAdd = yield* git("worktree", "add", "--quiet", "--detach", worktree)
    expect(worktreeAdd).toBe(0)
    yield* fs.writeFileString(path.join(main, ".env"), "TRAITS_TEST_SHARED=main\nTRAITS_TEST_MAIN_ONLY=main\n")

    const inheritedShared = yield* load(worktree, "TRAITS_TEST_SHARED")
    expect(inheritedShared).toBe("main")
    yield* fs.writeFileString(path.join(worktree, ".env"), "TRAITS_TEST_SHARED=worktree\n")
    const worktreeShared = yield* load(worktree, "TRAITS_TEST_SHARED")
    expect(worktreeShared).toBe("worktree")
    const worktreeMainOnly = yield* load(worktree, "TRAITS_TEST_MAIN_ONLY")
    expect(worktreeMainOnly).toBe("main")
    const mainShared = yield* load(main, "TRAITS_TEST_SHARED")
    expect(mainShared).toBe("main")

    yield* fs.writeFileString(path.join(outside, ".env"), "TRAITS_TEST_SHARED=outside\n")
    const outsideShared = yield* load(outside, "TRAITS_TEST_SHARED")
    expect(outsideShared).toBe("outside")
    const outsideMainOnly = yield* load(outside, "TRAITS_TEST_MAIN_ONLY")
    expect(outsideMainOnly).toBeUndefined()
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)
