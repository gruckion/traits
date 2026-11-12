import { Layer, String } from "effect"
import { McpProtocol, McpServer } from "effect/ai"
import { Command } from "effect/cli"

import PackageJson from "../package.json" with { type: "json" }
import { toolkit } from "../reflection/toolkit.ts"
import * as TraitDatabase from "../TraitDatabase.ts"

export const reflection = Command.make("reflection").pipe(
  Command.withDescription("Run the reflection SQL MCP server over stdio"),
  Command.withHandler(() =>
    McpServer.layerStdio({
      name: "reflection",
      version: PackageJson.version,
      protocols: [McpProtocol.v2025_11_25],
      registrations: toolkit.pipe(Layer.provide(TraitDatabase.layerLocal)),
      instructions: String.stripMargin(`
      | Query local OTLP data with the query tool using SQL. The worktree database is .agents/traits/traits.sqlite.
      | Tables: spans, logs, runs. Join spans/logs.runId to runs.id; filter runs.sectionId for a script.
      | Inspect columns with PRAGMA table_info(spans), PRAGMA table_info(logs), or PRAGMA table_info(runs).
      | Error spans have statusCode = 2; error logs have severityNumber >= 17.
      | record, resource, and scope are JSON text; use json_extract for nested fields. Nanosecond timestamps are decimal text; receivedAt is epoch milliseconds.
      | SQL controls projection, ordering, and limits. Results are JSON rows. Active spans appear only after ending and exporter flushing.
      `)
    }).pipe(Layer.launch)
  )
)
