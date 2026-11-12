#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Cause, Console, Effect, Logger, Runtime } from "effect"
import { Command } from "effect/cli"
import { Reactivity } from "effect/reactivity"

import * as Mcp from "./commands/mcp.ts"
import { reflection } from "./commands/reflection.ts"
import * as Run from "./commands/run.ts"
import PackageJson from "./package.json" with { type: "json" }

Command.make("traits").pipe(
  Command.withDescription("Run the Traits MCP server or inspect worktree telemetry"),
  Command.withHandler(() => Mcp.serve),
  Command.withSubcommands([Mcp.mcp, Run.run, reflection]),
  Command.run({ version: PackageJson.version }),
  Effect.provide([NodeServices.layer, Reactivity.layer, Logger.layer([Logger.withConsoleError(Logger.formatSimple)])]),
  Effect.tapCause((cause) =>
    Cause.hasInterruptsOnly(cause) || !Runtime.getErrorReported(Cause.squash(cause))
      ? Effect.void
      : Console.error(Cause.pretty(cause))
  ),
  NodeRuntime.runMain({ disableErrorReporting: true })
)
