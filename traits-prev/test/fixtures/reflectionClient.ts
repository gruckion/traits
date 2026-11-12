import { Effect, Fiber, Path, pipe, Queue, Schema as S, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

export const connect = Effect.fnUntraced(function* (cwd: string) {
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const requests = yield* Queue.unbounded<string>()
  const responses = yield* Queue.unbounded<string>()
  const child = yield* spawner.spawn(
    ChildProcess.make(process.execPath, [path.resolve(import.meta.dirname, "../../bin.ts"), "reflection"], {
      cwd,
      stdin: Stream.fromQueue(requests).pipe(Stream.encodeText)
    })
  )
  const stderr = yield* child.stderr.pipe(Stream.decodeText(), Stream.mkString, Effect.forkScoped)
  const exited = child.exitCode.pipe(
    Effect.flatMap((code) =>
      Fiber.join(stderr).pipe(
        Effect.flatMap((diagnostics) => Effect.die(`Reflection exited before replying (${code}): ${diagnostics}`))
      )
    )
  )
  yield* child.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) => Queue.offer(responses, line)),
    Effect.forkScoped
  )
  let id = 0
  const request = Effect.fnUntraced(function* (method: string, params: S.JsonObject = {}) {
    const requestId = ++id
    const text = yield* pipe(
      { jsonrpc: "2.0", id: requestId, method, params },
      S.encodeEffect(S.fromJsonString(S.JsonObject))
    )
    yield* Queue.offer(requests, `${text}\n`)
    while (true) {
      const line = yield* Queue.take(responses).pipe(Effect.raceFirst(exited))
      const response = yield* pipe(line, S.decodeEffect(S.fromJsonString(S.JsonObject)))
      if (response.id === requestId) return response
    }
  })
  yield* request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "reflection-test", version: "1" }
  })
  yield* Queue.offer(requests, '{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
  return request
})

export const query = Effect.fnUntraced(function* (cwd: string, sql: string) {
  const request = yield* connect(cwd)
  const response = yield* request("tools/call", { name: "query", arguments: { sql } })
  const result = yield* pipe(
    response,
    S.decodeUnknownEffect(
      S.Struct({
        result: S.Struct({
          isError: S.Literal(false),
          content: S.NonEmptyArray(S.Struct({ type: S.Literal("text"), text: S.String }))
        })
      })
    )
  )
  return yield* pipe(result.result.content[0].text, S.decodeEffect(S.fromJsonString(S.Array(S.JsonObject))))
}, Effect.scoped)
