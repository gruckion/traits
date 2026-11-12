import { gzipSync } from "node:zlib"

import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Array, Effect, Path, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { Reactivity } from "effect/reactivity"

import * as Protocol from "../../reflection/Protocol.ts"
import { serve } from "../../reflection/serve.ts"
import { T } from "../../tables/index.ts"
import * as Database from "../../TraitDatabase.ts"
import { databaseDirectory } from "../fixtures/databaseDirectory.ts"

it.effect(
  "commits precise JSON records from gzip and rejects malformed requests atomically",
  Effect.fnUntraced(
    function* () {
      const path = yield* Path.Path
      const directory = yield* databaseDirectory("reflection-")
      yield* Effect.gen(function* () {
        const db = yield* Database.TraitDatabase
        yield* db.insert(T.runs).values({ id: "run", command: ["fixture"], cwd: directory, startedAt: 1 })
        const endpoint = yield* serve("run")
        const client = yield* HttpClient.HttpClient
        const post = Effect.fnUntraced(function* (
          signal: Protocol.Signal,
          contentType: string,
          payload: Uint8Array,
          gzip: boolean = false
        ) {
          return yield* client.execute(
            HttpClientRequest.post(`${endpoint}/v1/${signal}`).pipe(
              HttpClientRequest.bodyUint8Array(gzip ? gzipSync(payload) : payload, contentType),
              HttpClientRequest.setHeader("content-encoding", gzip ? "gzip" : "identity")
            )
          )
        })
        const json = Buffer.from(
          JSON.stringify({
            resourceSpans: [
              {
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId: "0123456789abcdef0123456789abcdef",
                        spanId: "0123456789abcdef",
                        name: "precise",
                        startTimeUnixNano: "1792768000123456789",
                        endTimeUnixNano: "1792768000123456790",
                        attributes: [{ key: "integer", value: { intValue: "9223372036854775807" } }],
                        futureField: "preserved"
                      }
                    ]
                  }
                ]
              }
            ]
          })
        )
        const response = yield* post("traces", "application/json; charset=utf-8", json, true)
        expect(response.status).toBe(200)
        const responseText = yield* response.text
        expect(responseText).toBe("{}")
        const invalidJson = yield* post("logs", "application/json", Buffer.from("[]"))
        const invalidProtobuf = yield* post("traces", "application/x-protobuf", Buffer.from([10, 255]))
        const unsupported = yield* post("logs", "text/plain", Buffer.from("{}"))
        expect(invalidJson.status).toBe(400)
        expect(invalidProtobuf.status).toBe(415)
        expect(unsupported.status).toBe(415)
        const malformed = yield* post(
          "traces",
          "application/json",
          Buffer.from(
            JSON.stringify({
              resourceSpans: [{ scopeSpans: [{ spans: [{ name: "must roll back" }, { name: 123 }] }] }]
            })
          )
        )
        expect(malformed.status).toBe(400)
        const rows = yield* db.select().from(T.spans)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          name: "precise",
          startTimeUnixNano: "1792768000123456789",
          record: {
            futureField: "preserved",
            attributes: [{ key: "integer", value: { intValue: "9223372036854775807" } }]
          }
        })
      }).pipe(Effect.provide(Database.layerFile(path.join(directory, "traits.sqlite"))))
    },
    Effect.provide([NodeServices.layer, Reactivity.layer, FetchHttpClient.layer])
  )
)

it.effect(
  "runs real JSON Effect exporters and preserves shell/argv/stdio/exit behavior",
  Effect.fnUntraced(
    function* () {
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const directory = yield* databaseDirectory("reflection-")
      const cli = path.resolve(import.meta.dirname, "../../main.ts")
      const fixture = path.resolve(import.meta.dirname, "../fixtures/telemetry.ts")
      {
        const child = yield* spawner.spawn(
          ChildProcess.make(
            process.execPath,
            [cli, "run", "--id", "telemetry", "--", process.execPath, fixture, "json"],
            {
              cwd: directory
            }
          )
        )
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            child.stdout.pipe(Stream.decodeText(), Stream.mkString),
            child.stderr.pipe(Stream.decodeText(), Stream.mkString),
            child.exitCode
          ],
          { concurrency: "unbounded" }
        )
        expect(exitCode, stderr).toBe(0)
        expect(stdout).toBe("child stdout\n")
        expect(stderr).toBe("child stderr\n")
      }
      const shell = yield* spawner.spawn(
        ChildProcess.make(
          process.execPath,
          [
            cli,
            "run",
            "--id",
            "pipeline",
            `"${process.execPath}" -e "process.stdin.setEncoding('utf8');process.stdin.on('data',c=>process.stdout.write(c.toUpperCase()));process.stdin.on('end',()=>{process.exitCode=23})"`
          ],
          {
            cwd: directory,
            stdin: Stream.make(Buffer.from("hello\n"))
          }
        )
      )
      const [stdout, exitCode] = yield* Effect.all(
        [shell.stdout.pipe(Stream.decodeText(), Stream.mkString), shell.exitCode],
        { concurrency: "unbounded" }
      )
      expect(stdout).toBe("HELLO\n")
      expect(exitCode).toBe(23)
      yield* Effect.gen(function* () {
        const db = yield* Database.TraitDatabase
        const runs = yield* db.select().from(T.runs)
        expect(Array.map(runs, (run) => run.exitCode)).toEqual([0, 23])
        expect(Array.map(runs, (run) => run.sectionId)).toEqual(["telemetry", "pipeline"])
        const logs = yield* db.select().from(T.logs)
        const spans = yield* db.select().from(T.spans)
        expect(logs).toHaveLength(1)
        expect(logs[0]!.record.body).toEqual({
          arrayValue: { values: [{ stringValue: "fixture log" }, { stringValue: '{"answer":42}' }] }
        })
        expect(spans).toMatchObject([{ name: "fixture span" }])
      }).pipe(Effect.provide(Database.layerFile(path.join(directory, ".agents", "traits", "traits.sqlite"))))
    },
    Effect.provide([NodeServices.layer, Reactivity.layer, FetchHttpClient.layer])
  )
)
