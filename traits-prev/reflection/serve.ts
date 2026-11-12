import { createServer } from "node:http"
import { gunzip } from "node:zlib"

import { NodeHttpServer } from "@effect/platform-node"
import { ByteSize, Clock, Context, Effect, Layer, pipe, Schema as S, String } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

import { T } from "../tables/index.ts"
import { TraitDatabase } from "../TraitDatabase.ts"
import { Api } from "./Api.ts"
import * as Protocol from "./Protocol.ts"

const maxBodySize = 16 * 1024 * 1024

export const serve = Effect.fnUntraced(function* (runId: string) {
  const ingest = Effect.fnUntraced(
    function* (signal: Protocol.Signal) {
      const request = yield* HttpServerRequest.HttpServerRequest
      const contentType: string = pipe(
        request.headers["content-type"] ?? "",
        String.split(";"),
        (parts) => parts[0],
        String.trim,
        String.toLowerCase
      )
      if (contentType !== "application/json") {
        return HttpServerResponse.empty({ status: 415 })
      }
      const encoding = String.toLowerCase(request.headers["content-encoding"] ?? "identity")
      if (encoding !== "identity" && encoding !== "gzip") return HttpServerResponse.empty({ status: 415 })
      const bytes = yield* request.arrayBuffer
      const payload =
        encoding === "gzip"
          ? yield* Effect.callback<Buffer, Protocol.InvalidPayload>((resume) => {
              gunzip(Buffer.from(bytes), { maxOutputLength: maxBodySize }, (cause, result) => {
                resume(cause !== null ? Protocol.InvalidPayload.make({ cause }) : Effect.succeed(result))
              })
            })
          : Buffer.from(bytes)
      const body = yield* Protocol.decode(payload)
      const receivedAt = yield* Clock.currentTimeMillis
      const db = yield* TraitDatabase
      const objects = S.decodeUnknownEffect(S.Array(S.JsonObject))
      const groups = yield* objects(body[signal === "traces" ? "resourceSpans" : "resourceLogs"] ?? [])
      yield* Effect.gen(function* () {
        for (const group of groups) {
          const resource = yield* pipe(group.resource ?? {}, S.decodeUnknownEffect(S.JsonObject))
          const resourceSchemaUrl = yield* pipe(group.schemaUrl ?? "", S.decodeUnknownEffect(S.String))
          const scopes = yield* objects(group[signal === "traces" ? "scopeSpans" : "scopeLogs"] ?? [])
          for (const group of scopes) {
            const scope = yield* pipe(group.scope ?? {}, S.decodeUnknownEffect(S.JsonObject))
            const scopeSchemaUrl = yield* pipe(group.schemaUrl ?? "", S.decodeUnknownEffect(S.String))
            const records = yield* objects(group[signal === "traces" ? "spans" : "logRecords"] ?? [])
            for (const record of records) {
              // Validate indexed fields without stripping unknown fields from the original record.
              const indexed = yield* pipe(
                record,
                S.decodeEffect(
                  S.Struct({
                    traceId: S.String.pipe(S.optional),
                    spanId: S.String.pipe(S.optional),
                    parentSpanId: S.String.pipe(S.optional),
                    name: S.String.pipe(S.optional),
                    startTimeUnixNano: S.String.pipe(S.optional),
                    endTimeUnixNano: S.String.pipe(S.optional),
                    timeUnixNano: S.String.pipe(S.optional),
                    observedTimeUnixNano: S.String.pipe(S.optional),
                    severityNumber: S.Int.pipe(S.optional),
                    severityText: S.String.pipe(S.optional),
                    status: S.Struct({ code: S.Int.pipe(S.optional) }).pipe(S.optional)
                  })
                )
              )
              const common = {
                runId,
                receivedAt,
                record,
                resource,
                scope,
                resourceSchemaUrl,
                scopeSchemaUrl,
                traceId: indexed.traceId === undefined ? undefined : String.toLowerCase(indexed.traceId),
                spanId: indexed.spanId === undefined ? undefined : String.toLowerCase(indexed.spanId)
              }
              if (signal === "traces") {
                yield* db.insert(T.spans).values({
                  ...common,
                  parentSpanId:
                    indexed.parentSpanId === undefined ? undefined : String.toLowerCase(indexed.parentSpanId),
                  name: indexed.name,
                  startTimeUnixNano: indexed.startTimeUnixNano,
                  endTimeUnixNano: indexed.endTimeUnixNano,
                  statusCode: indexed.status?.code
                })
              } else {
                yield* db.insert(T.logs).values({
                  ...common,
                  timeUnixNano: indexed.timeUnixNano,
                  observedTimeUnixNano: indexed.observedTimeUnixNano,
                  severityNumber: indexed.severityNumber,
                  severityText: indexed.severityText
                })
              }
            }
          }
        }
      }).pipe(db.$client.withTransaction)
      return HttpServerResponse.text("{}", { contentType })
    },
    Effect.catchTags({
      InvalidPayload: () => Effect.succeed(HttpServerResponse.empty({ status: 400 })),
      SchemaError: () => Effect.succeed(HttpServerResponse.empty({ status: 400 })),
      HttpServerError: () => Effect.succeed(HttpServerResponse.empty({ status: 400 })),
      EffectDrizzleQueryError: () =>
        Effect.succeed(HttpServerResponse.empty({ status: 503, headers: { "retry-after": "1" } })),
      SqlError: () => Effect.succeed(HttpServerResponse.empty({ status: 503, headers: { "retry-after": "1" } }))
    })
  )
  const handlers = HttpApiBuilder.group(Api, "otlp", (handlers) =>
    handlers.handleRaw("traces", () => ingest("traces")).handleRaw("logs", () => ingest("logs"))
  )
  const routes = HttpApiBuilder.layer(Api).pipe(Layer.provide(handlers))
  const server = HttpRouter.serve(routes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port: 0 })),
    Layer.provide(Layer.succeed(HttpServerRequest.MaxBodySize, ByteSize.bytes(maxBodySize)))
  )
  const context = yield* Layer.build(server)
  const address = Context.get(context, HttpServer.HttpServer).address
  if (address._tag === "UnixPathAddress") return yield* Effect.die("Expected a TCP listener")
  return `http://127.0.0.1:${address.port}`
})
