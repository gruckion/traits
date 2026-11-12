#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Cause, Console, Effect, Runtime } from "effect"

import { Cli } from "./Cli/Cli.ts"

// Reports errors on stderr, so stdout carries only command output such as reports and MCP messages.
Cli.pipe(
  Effect.tapCause((cause) =>
    Cause.hasInterruptsOnly(cause) || !Runtime.getErrorReported(Cause.squash(cause))
      ? Effect.void
      : Console.error(Cause.pretty(cause))
  ),
  Effect.provide(NodeServices.layer),
  (effect) => NodeRuntime.runMain(effect, { disableErrorReporting: true })
)
