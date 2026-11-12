import { fileURLToPath } from "node:url"

import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Array, Effect, FileSystem, Path, pipe, Queue, Schedule, Schema as S, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import * as CheckReport from "../CheckReport.ts"
import * as Source from "../Source.ts"
import * as Trait from "../Trait.ts"
import * as Evaluation from "../TraitEvaluation.ts"
import * as ReflectionClient from "./fixtures/reflectionClient.ts"

const effectUrl = new URL("../../node_modules/effect/dist/index.js", import.meta.url).href
const aiUrl = new URL("../../node_modules/effect/dist/ai/index.js", import.meta.url).href
const server = fileURLToPath(new URL("../main.ts", import.meta.url))

it.effect(
  "returns handler defects as MCP errors and cached trait findings as valid JSON",
  Effect.fn("test.ToolErrorsMcp")(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "traits-tool-errors-" }).pipe(Effect.flatMap(fs.realPath))
    yield* spawner.exitCode(ChildProcess.make("git", ["init", "--quiet"], { cwd }))
    const configSource = String.stripMargin(`
    |import { Effect, Layer, Record, Redacted } from ${JSON.stringify(effectUrl)};
    |import { DecisionModel } from ${JSON.stringify(aiUrl)};
    |export default {
    |  excludeGitignored: false,
    |  layerDecisionModel: Layer.effect(DecisionModel.DecisionModel, DecisionModel.make({
    |    decide: (options) => JSON.stringify(options.state).includes("serialize-success")
    |      ? Effect.succeed({
    |          answers: Record.map(options.decisions, (_, name) => ({
    |            _tag: "Classify", label: name === "clean" ? "compliant" : name === "uncertain" ? "inconclusive" : "violation",
    |            probabilities: name === "clean"
    |              ? { compliant: 1, violation: 0, "not-applicable": 0, inconclusive: 0 }
    |              : name === "uncertain"
    |                ? { compliant: 0.25, violation: 0.25, "not-applicable": 0, inconclusive: 0.5 }
    |                : { compliant: 0.25, violation: 0.5, "not-applicable": 0.25, inconclusive: 0 }
    |          })),
    |          usage: { inputTokens: undefined, outputTokens: undefined }
    |        })
    |      : Effect.die(Object.assign(new Error("model adapter failed"), { apiKey: Redacted.make("test-secret") }))
    |  })),
    |  layerLanguageModel: Layer.empty
    |};
    `)
    yield* fs.writeFileString(path.join(cwd, "traits.ts"), configSource)
    const trait = Trait.Trait.make({
      name: Trait.TraitName.make("existing"),
      subject: "Bindings.",
      requirement: "Prefer const.",
      purpose: "Keep bindings immutable.",
      applicability: "TypeScript bindings.",
      context: "Preserve this supporting example and explanation."
    })
    const uncertain = Trait.Trait.make({
      ...trait,
      name: Trait.TraitName.make("uncertain"),
      requirement: "Inspect surrounding context."
    })
    const clean = Trait.Trait.make({ ...trait, name: Trait.TraitName.make("clean") })
    yield* fs.makeDirectory(path.join(cwd, ".agents/traits"), { recursive: true })
    yield* fs.writeFileString(path.join(cwd, ".agents/traits/existing.md"), Trait.serialize(trait))
    yield* fs.writeFileString(path.join(cwd, ".agents/traits/uncertain.md"), Trait.serialize(uncertain))
    yield* fs.writeFileString(path.join(cwd, ".agents/traits/clean.md"), Trait.serialize(clean))
    yield* fs.writeFileString(path.join(cwd, "input.ts"), "const value = 1\n")
    const requests = yield* Queue.unbounded<string>()
    const responses = yield* Queue.unbounded<string>()
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [server], {
        cwd,
        extendEnv: true,
        env: { OTEL_BSP_SCHEDULE_DELAY: "100" },
        stdin: Stream.fromQueue(requests).pipe(Stream.encodeText),
        stderr: "inherit"
      })
    )
    yield* child.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) => Queue.offer(responses, line)),
      Effect.forkScoped
    )
    const request = Effect.fn("test.ToolErrorsMcp.request")(function* (
      id: number,
      method: string,
      params: unknown = {}
    ) {
      yield* Queue.offer(requests, `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
      while (true) {
        const text = yield* Queue.take(responses).pipe(
          Effect.raceFirst(
            child.exitCode.pipe(Effect.flatMap((code) => Effect.die(`MCP server exited before replying (${code})`)))
          )
        )
        const response = yield* pipe(
          text,
          S.decodeEffect(
            S.fromJsonString(
              S.Struct({
                id: S.Int.pipe(S.optional),
                result: S.Unknown.pipe(S.optional)
              })
            )
          )
        )
        if (response.id === id) return response.result
      }
    })
    yield* request(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    })
    yield* Queue.offer(requests, `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    for (const tool of [
      { name: "check_traits", arguments: { include: ["input.ts"] } },
      { name: "derive_trait", arguments: { proposedTrait: { ...trait, name: "proposed" } } }
    ]) {
      const response = yield* request(tool.name === "check_traits" ? 2 : 3, "tools/call", tool)
      expect(response).toMatchObject({ isError: true, content: [{ type: "text" }] })
      const serialized = JSON.stringify(response)
      expect(serialized).toContain("ToolExecutionError")
      expect(serialized).toContain("model adapter failed")
      expect(serialized).not.toContain("test-secret")
    }
    const ping = yield* request(4, "ping")
    expect(ping).toEqual({})
    const inputText = "// serialize-success\nconst value = 1\n"
    const otherText = pipe(
      Array.makeBy(205, (index) => `// serialize-success line ${index + 1}`),
      Array.join("\n")
    )
    yield* fs.writeFileString(path.join(cwd, "input.ts"), inputText)
    yield* fs.writeFileString(path.join(cwd, "other.ts"), otherText)
    const successful = yield* request(5, "tools/call", {
      name: "check_traits",
      arguments: { include: ["other.ts", "input.ts", "input.ts"] }
    })
    expect(successful).toMatchObject({ isError: false })
    expect(JSON.stringify(successful)).toContain(trait.name)
    expect(JSON.stringify(successful)).toContain(trait.requirement)
    const decodeReport = Effect.fnUntraced(function* (response: unknown) {
      const result = yield* pipe(
        response,
        S.decodeUnknownEffect(
          S.Struct({
            isError: S.Literal(false),
            content: S.NonEmptyArray(S.Struct({ type: S.Literal("text"), text: S.String }))
          })
        )
      )
      return yield* pipe(result.content[0].text, S.decodeEffect(S.fromJsonString(CheckReport.CheckReport)))
    })
    const report = yield* decodeReport(successful)
    expect(report.traits).toEqual([trait, uncertain])
    expect(Array.map(report.files, (file) => file.path)).toEqual([
      path.join(cwd, "input.ts"),
      path.join(cwd, "other.ts")
    ])
    expect(Array.map(report.files, (file) => Array.map(file.chunks, (chunk) => chunk.startLine))).toEqual([
      [1],
      [1, 201]
    ])
    expect(report.files[0]!.chunks[0].text).toBe(inputText)
    expect(report.files[1]!.chunks[1]!.text).toBe(
      pipe(String.split(otherText, "\n"), Array.drop(200), Array.join("\n"))
    )
    const revisions = yield* Effect.forEach([inputText, otherText], CheckReport.revision)
    expect(Array.map(report.files, (file) => file.revision)).toEqual(revisions)
    const definitions = new Map(Array.map(report.traits, (trait) => [trait.name, trait] as const))
    const expanded = Array.flatMap(report.files, (file) =>
      Array.flatMap(file.chunks, (chunk) =>
        Array.map(chunk.findings, (finding) =>
          Evaluation.TraitEvaluation.make({
            trait: definitions.get(finding.traitName)!,
            source: Source.Source.make({
              text: chunk.text,
              location: Source.SourceLocation.cases.File.make({ path: file.path, startLine: chunk.startLine })
            }),
            assessment: finding.assessment
          })
        )
      )
    )
    expect(expanded).toHaveLength(6)
    expect(Array.map(expanded, (evaluation) => evaluation.assessment.classification)).toEqual([
      "violation",
      "inconclusive",
      "violation",
      "inconclusive",
      "violation",
      "inconclusive"
    ])
    expect(expanded[1]!.assessment.probabilities).toEqual({
      compliant: 0.25,
      violation: 0.25,
      "not-applicable": 0,
      inconclusive: 0.5
    })
    expect(JSON.stringify(report).length).toBeLessThan(JSON.stringify(expanded).length)
    const emptyResponse = yield* request(6, "tools/call", { name: "check_traits", arguments: { include: [] } })
    const empty = yield* decodeReport(emptyResponse)
    expect(empty).toEqual({ traits: [], files: [] })
    const files = yield* fs.readDirectory(path.join(cwd, ".agents/traits"))
    expect(files).not.toContain("proposed.md")
    const output = yield* ReflectionClient.query(
      cwd,
      "SELECT spans.record FROM spans JOIN runs ON spans.runId = runs.id WHERE runs.sectionId = 'traits' AND spans.name IN ('CheckTraits.check', 'DeriveTrait.derive') LIMIT 1000"
    ).pipe(
      Effect.repeat({ schedule: Schedule.spaced("100 millis"), until: (rows) => rows.length === 4 }),
      Effect.timeout("15 seconds")
    )
    yield* child.kill({ killSignal: "SIGTERM" })
    yield* child.exitCode
    const spans = yield* pipe(
      output,
      S.decodeUnknownEffect(
        S.Array(
          S.Struct({
            record: S.fromJsonString(
              S.Struct({
                name: S.String,
                traceId: S.String,
                parentSpanId: S.String.pipe(S.optional)
              })
            )
          })
        )
      )
    )
    const roots = Array.filter(
      spans,
      (span) => span.record.name === "CheckTraits.check" || span.record.name === "DeriveTrait.derive"
    )
    expect(roots).toHaveLength(4)
    expect(
      pipe(
        roots,
        Array.map((span) => span.record.traceId),
        Array.dedupe
      )
    ).toHaveLength(4)
    for (const span of roots) expect(span.record.parentSpanId ?? "").toBe("")
  }, Effect.provide(NodeServices.layer)),
  { timeout: 40000 }
)
