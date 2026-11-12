import { fileURLToPath } from "node:url"

import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Array, Effect, Fiber, FileSystem, Path, pipe, Queue, Schedule, Schema as S, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import * as ReflectionClient from "./fixtures/reflectionClient.ts"

const launcher = fileURLToPath(new URL("../bin.ts", import.meta.url))
const effectUrl = new URL("../../node_modules/effect/dist/index.js", import.meta.url).href

it.effect(
  "launches Traits with reflection, clean MCP stdio and queryable failure telemetry",
  Effect.fnUntraced(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "traits-launcher-" })
    yield* spawner.exitCode(ChildProcess.make("git", ["init", "--quiet"], { cwd }))
    yield* fs.writeFileString(
      path.join(cwd, "package.json"),
      JSON.stringify({ private: true, packageManager: "npm@11.0.0" })
    )
    yield* fs.writeFileString(
      path.join(cwd, "traits.ts"),
      String.stripMargin(`
      |import { Effect, Layer } from ${JSON.stringify(effectUrl)};
      |export default {
      |  layerDecisionModel: Layer.effectDiscard(
      |    Effect.logError("launcher telemetry fixture server-pid=" + process.pid).pipe(
      |      Effect.andThen(Effect.die("launcher fixture failure")),
      |      Effect.withSpan("traits.launcher.fixture")
      |    )
      |  ),
      |  layerLanguageModel: Layer.empty
      |};
      `)
    )
    const requests = yield* Queue.unbounded<string>()
    const responses = yield* Queue.unbounded<string>()
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [launcher, "mcp"], {
        cwd,
        stdin: Stream.fromQueue(requests).pipe(Stream.encodeText),
        extendEnv: true,
        env: {
          npm_config_audit: "false",
          npm_config_fund: "false",
          OTEL_SDK_DISABLED: "false",
          OTEL_BSP_SCHEDULE_DELAY: "100",
          OTEL_BLRP_SCHEDULE_DELAY: "100"
        }
      })
    )
    const stderr = yield* child.stderr.pipe(Stream.decodeText(), Stream.mkString, Effect.forkScoped)
    const exited = child.exitCode.pipe(
      Effect.flatMap((code) =>
        Fiber.join(stderr).pipe(
          Effect.flatMap((diagnostics) => Effect.die(`Launcher exited before replying (${code}): ${diagnostics}`))
        )
      )
    )
    yield* child.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) => Queue.offer(responses, line)),
      Effect.forkScoped
    )
    yield* Queue.offer(
      requests,
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "launcher-test", version: "1" }
        }
      })}\n`
    )
    const response = yield* Queue.take(responses).pipe(
      Effect.raceFirst(exited),
      Effect.flatMap(S.decodeEffect(S.fromJsonString(S.JsonObject)))
    )
    expect(response).toMatchObject({
      id: 1,
      result: { serverInfo: { name: "traits" }, instructions: expect.stringContaining("Traits capture durable") }
    })
    yield* Queue.offer(requests, `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    for (const id of [2, 3]) {
      yield* Queue.offer(
        requests,
        `${JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: {
            name: "check_traits",
            arguments: { include: [] }
          }
        })}\n`
      )
      const failed = yield* Queue.take(responses).pipe(
        Effect.raceFirst(exited),
        Effect.flatMap(S.decodeEffect(S.fromJsonString(S.JsonObject))),
        Effect.repeat({ until: (response) => response.id === id })
      )
      expect(failed).toMatchObject({ result: { isError: true } })
    }
    const inspect = Effect.fnUntraced(function* (signal: "traces" | "logs", search: string) {
      const output = yield* ReflectionClient.query(
        cwd,
        `SELECT telemetry.*, runs.sectionId FROM ${signal === "traces" ? "spans" : "logs"} AS telemetry JOIN runs ON telemetry.runId = runs.id WHERE runs.sectionId = 'traits' AND ${signal === "traces" ? "statusCode = 2" : "severityNumber >= 17"} AND telemetry.record LIKE '%${search}%'`
      )
      return yield* pipe(
        output,
        S.decodeUnknownEffect(
          S.Array(
            S.Struct({
              sectionId: S.String,
              record: S.fromJsonString(S.JsonObject),
              resource: S.fromJsonString(S.JsonObject)
            })
          )
        )
      )
    })
    // Observe exported request spans before termination; Windows kills Node without running finalizers.
    const spans = yield* inspect("traces", "").pipe(
      Effect.repeat({
        schedule: Schedule.spaced("100 millis"),
        until: (rows) => Array.filter(rows, (row) => row.record.name === "CheckTraits.check").length === 2
      }),
      Effect.timeout("15 seconds")
    )
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "traits",
          record: expect.objectContaining({
            name: "traits.launcher.fixture",
            status: expect.objectContaining({ code: 2 })
          })
        })
      ])
    )
    const roots = Array.filterMap(spans, (span) =>
      pipe(
        span,
        S.decodeUnknownResult(
          S.Struct({
            record: S.Struct({ name: S.Literal("CheckTraits.check"), traceId: S.String })
          })
        )
      )
    )
    expect(roots).toHaveLength(2)
    expect(
      pipe(
        roots,
        Array.map((span) => span.record.traceId),
        Array.dedupe
      )
    ).toHaveLength(2)
    const logs = yield* inspect("logs", "launcher telemetry fixture").pipe(
      Effect.repeat({ schedule: Schedule.spaced("100 millis"), until: (rows) => rows.length > 0 }),
      Effect.timeout("15 seconds")
    )
    expect(JSON.stringify(logs)).toContain(`server-pid=${child.pid}`)
    expect(logs.length).toBeGreaterThan(0)
    expect(Array.every(logs, (entry) => entry.sectionId === "traits")).toBe(true)
    expect(logs[0]).toMatchObject({
      resource: { attributes: expect.arrayContaining([{ key: "service.name", value: { stringValue: "traits" } }]) }
    })
    yield* child.kill({ killSignal: "SIGTERM" })
    const exitCode = yield* child.exitCode
    expect(exitCode).toBe(process.platform === "win32" ? 1 : 130)
    const diagnostics = yield* Fiber.join(stderr)
    expect(diagnostics).toContain("[traits] Installing dependencies")
    if (process.platform !== "win32") {
      const shutdown = yield* ReflectionClient.query(
        cwd,
        "SELECT spans.name, runs.endedAt, runs.exitCode FROM spans JOIN runs ON spans.runId = runs.id WHERE spans.name = 'traits.server'"
      )
      expect(shutdown).toEqual([{ name: "traits.server", endedAt: expect.any(Number), exitCode: 130 }])
    }
  }, Effect.provide(NodeServices.layer)),
  { timeout: 60000 }
)
