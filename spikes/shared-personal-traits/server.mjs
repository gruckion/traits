// THROWAWAY: shared Traits HTTP host. Default fixture mode; direct mode is experimental.
/* oxlint-disable effecttsgo/async-function, effecttsgo/process-env, effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- Throwaway host startup and exact-file admission intentionally use direct Node APIs; production integration must adopt the repo's Effect conventions. */
import { execFileSync } from "node:child_process"
import { readFile, realpath, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { isAbsolute, relative, resolve, basename, extname } from "node:path"

import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Context, Effect, Layer, Record, Semaphore } from "effect"
import { DecisionModel, LanguageModel, McpProtocol, McpSchema, McpServer } from "effect/ai"
import { Digest, SecureRandom } from "effect/crypto"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Reactivity } from "effect/reactivity"

import { ProjectPaths } from "../../traits/ProjectPaths.ts"
import { toolkit } from "../../traits/toolkit/toolkit.ts"
import * as TraitDatabase from "../../traits/TraitDatabase.ts"
import * as TraitProjectLock from "../../traits/TraitProjectLock.ts"
import { TraitsContext } from "../../traits/TraitsContext.ts"
import * as TraitStore from "../../traits/TraitStore.ts"

const home = await realpath(process.env.SPIKE_TRAITS_HOME)
const allowed = await realpath(process.env.SPIKE_WORK_FOLDER)
const traitsDirectory = await realpath(resolve(home, "traits"))
const mode = process.env.SPIKE_PROVIDER_MODE ?? "fixture"
if (mode !== "fixture" && mode !== "direct") throw new Error("Unknown SPIKE_PROVIDER_MODE")
const tokenFile = process.env.TRAITS_MCP_TOKEN_FILE
const token = tokenFile === undefined ? undefined : (await readFile(tokenFile, "utf8")).trim()
if (mode === "direct" && (token === undefined || token.length < 32))
  throw new Error("Direct mode requires a private MCP authentication token file")
const port = Number(process.env.TRAITS_MCP_PORT ?? 0)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid MCP port")
const privateSegments = new Set([
  ".git",
  "node_modules",
  ".traits-personal",
  ".cocoindex_code",
  ".venv",
  "venv",
  "dist",
  "build",
  "coverage"
])
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyi",
  ".go",
  ".swift",
  ".kt",
  ".java",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".txt",
  ".sql",
  ".sh",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".graphql",
  ".gql",
  ".prisma",
  ".vue",
  ".svelte",
  ".rs",
  ".rb",
  ".proto"
])
const direct =
  mode === "direct"
    ? await (await import("./direct-providers.mjs")).load({ credentialsFile: process.env.MONDASH_ENV_FILE })
    : undefined

// Exact paths keep the spike small. Check Git's own file set separately for each
// requested path, preserving ignored/untracked/tracked behavior across worktrees.
const guard = McpServer.middleware()((effect, options) => {
  if (options.method !== "tools/call" || options.target !== "check_traits") return effect
  return Effect.tryPromise({
    try: async () => {
      const includes = options.payload.arguments?.include
      if (!Array.isArray(includes)) throw new Error("Provide an explicit include array")
      for (const input of includes) {
        if (!isAbsolute(input)) throw new Error("Use absolute file paths in this shared-server spike")
        if (/[*?[\]{}()\\]/.test(input)) throw new Error("Paths containing glob syntax are unsupported in this spike")
        const file = await realpath(input)
        const inside = relative(allowed, file)
        if (inside === ".." || inside.startsWith("../") || isAbsolute(inside)) {
          throw new Error("File is outside the allowed work folder")
        }
        if (!(await stat(file)).isFile()) throw new Error("Select individual files, not directories or globs")
        if (file.split("/").some((segment) => privateSegments.has(segment.toLowerCase())))
          throw new Error("Private, dependency, generated and Git metadata paths are excluded")
        if (
          /^(\.env(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|credentials(?:\..*)?|id_(?:rsa|ed25519)(?:\..*)?)$/i.test(
            basename(file)
          )
        ) {
          throw new Error("Credential files are excluded")
        }
        if (
          !sourceExtensions.has(extname(file).toLowerCase()) &&
          !new Set(["Dockerfile", "Makefile", "Taskfile", ".gitignore"]).has(basename(file))
        )
          throw new Error("Only authored source, configuration and documentation files are eligible")
        const directory = resolve(file, "..")
        const root = execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
        const local = relative(root, file)
        const selected = execFileSync(
          "git",
          ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "--full-name", "-z", "--", local],
          { encoding: "utf8" }
        ).split("\0")
        if (!selected.includes(local)) throw new Error("File is ignored by its own Git checkout")
      }
    },
    catch: (cause) => McpSchema.InvalidParams.make({ message: cause.message })
  }).pipe(Effect.andThen(effect))
})

const hostServices = Layer.effectContext(
  Effect.gen(function* () {
    const model =
      direct !== undefined
        ? yield* DecisionModel.DecisionModel
        : yield* DecisionModel.make({
            decide: (options) =>
              Effect.succeed({
                // Intentionally deterministic: prove routing/storage, not AI judgment.
                answers: Record.map(options.decisions, (question) => {
                  const label = question.criteria?.distinct !== undefined ? "distinct" : "violation"
                  return {
                    _tag: "Classify",
                    label,
                    probabilities: Record.map(question.criteria, (_, key) => (key === label ? 1 : 0))
                  }
                }),
                usage: { inputTokens: undefined, outputTokens: undefined }
              })
          })
    const limit = yield* Semaphore.make(4)
    const language =
      direct !== undefined
        ? yield* LanguageModel.LanguageModel
        : yield* LanguageModel.make({
            generateText: () => Effect.die("Language generation is outside this fixture spike"),
            streamText: () => Effect.die("Language generation is outside this fixture spike")
          })
    return Context.make(DecisionModel.DecisionModel, model).pipe(
      Context.add(LanguageModel.LanguageModel, language),
      Context.add(ProjectPaths, { projectRoot: home, traitsDirectory }),
      Context.add(TraitsContext, {
        configRoot: allowed,
        excludes: ["**/.git/**", "**/node_modules/**"],
        asDecision: limit.withPermits(1),
        asFileRead: limit.withPermits(1),
        config: { excludeGitignored: false }
      })
    )
  })
).pipe(direct !== undefined ? Layer.provide(direct.layer) : (layer) => layer)

const registrations = toolkit.pipe(
  Layer.provide(TraitStore.layer),
  Layer.provideMerge(Layer.effectDiscard(TraitProjectLock.acquire)),
  Layer.provideMerge(hostServices),
  Layer.provideMerge(TraitDatabase.layerFile(resolve(home, "traits.sqlite")))
)

const routes = McpServer.layerHttp({
  name: mode === "fixture" ? "traits-shared-PROTOTYPE" : "solea-personal-traits",
  version: "0.0.0",
  path: "/mcp",
  protocols: [McpProtocol.v2025_11_25],
  allowSessionTermination: true,
  registrations: Layer.merge(registrations, guard.layerGlobal),
  instructions: `Personal Traits pilot using ${mode === "fixture" ? "fixture models" : "direct Jev and the Codex subscription"}. Applies only to work under ${allowed}. All agents and worktrees share the same preferences in ${traitsDirectory}. Use the installed traits skill for capture, exact-proposal approval and review workflow. check_traits requires explicit absolute source-file paths; no directories or globs. Each file's own Git ignore rules apply. Native elicitation is supported; if ApprovalRequired is returned, show the exact proposal and obtain approval before retrying approved:true. No trait is saved without approval. Do not add setup files or trait stores to application checkouts.`
})

const authenticated = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (token !== undefined && request.headers.authorization !== `Bearer ${token}`)
        return HttpServerResponse.empty({ status: 401 })
      return yield* httpEffect
    }),
  { global: true }
)

const server = HttpRouter.serve(Layer.merge(routes, authenticated), {
  disableLogger: true,
  disableListenLog: true
}).pipe(Layer.provideMerge(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port })))

Effect.gen(function* () {
  const services = yield* Layer.build(server)
  const address = Context.get(services, HttpServer.HttpServer).address
  yield* Console.log(JSON.stringify({ url: `http://127.0.0.1:${address.port}/mcp` }))
  return yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide([NodeServices.layer, Digest.layerWebCrypto, SecureRandom.layerWebCrypto, Reactivity.layer]),
  NodeRuntime.runMain
)
