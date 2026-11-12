import { Array, Context, DateTime, Effect, FileSystem, Layer, Path, pipe, Schema as S, Stream, String } from "effect"
import { Digest, SecureRandom } from "effect/crypto"
import { FetchHttpClient } from "effect/http"
import { KeyValueStore } from "effect/persistence"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { check } from "./Check/Check.ts"
import { EnrichmentRegistry } from "./Enrichment/EnrichmentRegistry.ts"
import * as Models from "./Models.ts"
import { SegmenterRegistry } from "./Segmenter/SegmenterRegistry.ts"
import * as TraitFile from "./TraitFile.ts"
import * as TraitsConfig from "./TraitsConfig.ts"
import { WorkspacePath } from "./util/util.ts"
import * as WorkspaceConfigProvider from "./WorkspaceConfigProvider.ts"
import * as WorkspaceLayout from "./WorkspaceLayout.ts"
import { WorkspaceRoot } from "./WorkspaceRoot.ts"
import * as WorkspaceTraits from "./WorkspaceTraits.ts"

/** Simultaneous file reads and `git show` subprocesses, so large path lists and trait sets stay within descriptor and process limits. */
const fileConcurrency = 16

/** Which workspace files to check, and which of the workspace's traits to check them against; every trait by default. */
export interface WorkspaceCheckRequest extends WorkspaceTraits.TraitSelection {
  /** Files to check, relative to the workspace root or absolute within it. */
  readonly paths: ReadonlyArray<string>
}

/** .agents/traits/_traits.json extends trait collections, which checking does not support yet. */
export class ExtendsUnsupportedError extends S.TaggedError<ExtendsUnsupportedError>()("ExtendsUnsupportedError", {}) {
  override get message(): string {
    return ".agents/traits/_traits.json extends other trait collections, which checking does not support yet. Remove extends to check the workspace's own traits."
  }
}

/** A requested path is not a file within the workspace, in the working tree or at HEAD. */
export class WorkspaceFileError extends S.TaggedError<WorkspaceFileError>()("WorkspaceFileError", {
  /** The requested path. */
  path: S.String.annotateKey({ description: "The requested path." }),
  /** Why the path cannot be checked. */
  problem: S.String.annotateKey({ description: "Why the path cannot be checked." }),
  /** The underlying failure, when there is one. */
  cause: S.Defect().annotateKey({ description: "The underlying failure, when there is one." }).pipe(S.optionalKey)
}) {
  override get message(): string {
    return `Cannot check ${this.path}: ${this.problem}`
  }
}

/** Checks workspace files against the selected traits with already loaded configuration, using the decision model and extension registries in context; comparing each file's working-tree text with its text at Git HEAD. */
export const run = Effect.fn("WorkspaceCheck.run")(function* (
  config: TraitsConfig.TraitsConfig,
  request: WorkspaceCheckRequest
) {
  if ((config.extends ?? []).length > 0) {
    return yield* ExtendsUnsupportedError.make({})
  }
  const names = yield* WorkspaceTraits.select(request)
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const { directory } = yield* WorkspaceRoot
  // Resolves relative to the workspace root even when it is a subdirectory of the repository.
  const committedText = Effect.fnUntraced(function* (file: WorkspacePath) {
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", ["show", `HEAD:./${file}`], {
        cwd: directory,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore"
      })
    )
    const { exitCode, text } = yield* Effect.all(
      { exitCode: handle.exitCode, text: handle.stdout.pipe(Stream.decodeText(), Stream.mkString) },
      { concurrency: "unbounded" }
    )
    // Untracked files, new files, and workspaces outside Git have no committed text.
    return exitCode === 0 ? text : undefined
  }, Effect.scoped)
  const workspacePaths = yield* Effect.forEach(
    request.paths,
    Effect.fnUntraced(function* (requested) {
      const absolute = path.resolve(directory, requested)
      // The workspace root is canonical, so canonicalize the parent too; it exists even for deleted files.
      const parent = yield* fs.realPath(path.dirname(absolute)).pipe(Effect.orElseSucceed(() => path.dirname(absolute)))
      return yield* pipe(
        path.relative(directory, path.join(parent, path.basename(absolute))),
        String.split(path.sep),
        Array.join("/"),
        S.decodeEffect(WorkspacePath),
        Effect.mapError(() => WorkspaceFileError.make({ path: requested, problem: "it is outside the workspace." }))
      )
    })
  )
  const changes = yield* Effect.forEach(
    Array.dedupe(workspacePaths),
    Effect.fnUntraced(function* (file) {
      const working = path.join(directory, file)
      const current = yield* fs.exists(working).pipe(
        Effect.flatMap((exists) => (exists ? fs.readFileString(working) : Effect.undefined)),
        Effect.mapError((cause) =>
          WorkspaceFileError.make({ path: file, problem: `it cannot be read: ${cause.message}`, cause })
        )
      )
      const committed = yield* committedText(file).pipe(Effect.orElseSucceed(() => undefined))
      const before = committed === undefined ? undefined : { path: file, text: committed }
      if (current === undefined) {
        return before === undefined
          ? yield* WorkspaceFileError.make({
              path: file,
              problem: "it exists neither in the working tree nor at HEAD."
            })
          : { change: { before } }
      }
      return { change: { after: { path: file, text: current }, ...(before === undefined ? {} : { before }) } }
    }),
    { concurrency: fileConcurrency }
  )
  const traits = yield* Effect.forEach(
    names,
    (name) =>
      Effect.map(TraitFile.load(name), (trait) => ({
        trait,
        origin: { path: WorkspacePath.make(WorkspaceLayout.traitFile(name)) }
      })),
    { concurrency: fileConcurrency }
  )
  return yield* check({ traits, changes })
})

/** Loads .agents/traits/_traits.json, builds its models and fresh extension registries, and checks the requested files. */
const checkWorkspace = Effect.fn("WorkspaceCheck.check")(function* (request: WorkspaceCheckRequest) {
  const config = yield* TraitsConfig.load
  const models = Models.layerDecisionLimit(config.concurrency).pipe(
    Layer.provideMerge(Models.layer(config.models).pipe(Layer.provide(WorkspaceConfigProvider.layer)))
  )
  const registries = Layer.mergeAll(SegmenterRegistry.layer, EnrichmentRegistry.layer).pipe(Layer.provideMerge(models))
  return yield* run(config, request).pipe(Effect.provide(registries))
})

/** Checks workspace files against the workspace's traits and configured models; shared by the CLI and the MCP server. */
export class WorkspaceCheck extends Context.Service<WorkspaceCheck>()("traits/WorkspaceCheck", {
  make: Effect.gen(function* () {
    const services = yield* Effect.context<Effect.Services<ReturnType<typeof checkWorkspace>>>()
    return {
      /** Checks the requested files, reloading .agents/traits/_traits.json and trait files on every call. */
      check: (request: WorkspaceCheckRequest) => checkWorkspace(request).pipe(Effect.provideContext(services))
    }
  })
}) {
  /** The checker with default host services; the host provides the platform (filesystem, paths, processes) and WorkspaceRoot. */
  static readonly layer = this.make.pipe(
    Layer.effect(this),
    Layer.provide([
      FetchHttpClient.layer,
      Digest.layerWebCrypto,
      SecureRandom.layerWebCrypto,
      KeyValueStore.layerMemory,
      DateTime.layerCurrentZoneLocal
    ])
  )
}
