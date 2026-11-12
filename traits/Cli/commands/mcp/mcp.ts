import { Effect, Layer, Logger } from "effect"
import { Command } from "effect/cli"

import { Server } from "../../../mcp/index.ts"

/** Runs the traits MCP server over stdio until the client disconnects; logs go to stderr so they never corrupt the protocol stream. */
export const mcp = Command.make("mcp").pipe(
  Command.withDescription("Run the traits MCP server over stdio"),
  Command.withHandler(() => Layer.launch(Server.layer).pipe(Effect.provideService(Logger.LogToStderr, true)))
)
