import { Layer } from "effect"
import { Command } from "effect/cli"
import { UserDirectories } from "effect/persistence"

import PackageJson from "../package.json" with { type: "json" }
import { WorkspaceCheck } from "../WorkspaceCheck.ts"
import { WorkspaceRoot } from "../WorkspaceRoot.ts"
import { CliPaths } from "./CliPaths.ts"
import { auth } from "./commands/auth/auth.ts"
import { check } from "./commands/check/check.ts"
import { mcp } from "./commands/mcp/mcp.ts"
import { profile } from "./commands/profile/profile.ts"
import { update } from "./commands/update/update.ts"
import { UserConfigLock } from "./UserConfigLock.ts"
import { UserFileSecurity } from "./UserFileSecurity.ts"

/** Locked access to user-level accounts and profiles; only commands that manage them build it. */
const userConfiguration = UserConfigLock.layer.pipe(
  Layer.provideMerge(UserFileSecurity.layer),
  Layer.provideMerge(CliPaths.layer),
  Layer.provideMerge(UserDirectories.layer)
)

/** Checking against the current directory's workspace; only commands that check files build it. */
const workspace = WorkspaceCheck.layer.pipe(Layer.provide(WorkspaceRoot.layer(".")))

export const Cli = Command.make("traits").pipe(
  Command.withDescription(
    "Check files against traits, serve traits over MCP, and manage credentials and model profiles"
  ),
  Command.withSubcommands([
    auth.pipe(Command.provide(userConfiguration)),
    profile.pipe(Command.provide(userConfiguration)),
    check.pipe(Command.provide(workspace)),
    mcp.pipe(Command.provide(workspace)),
    update
  ]),
  Command.run({ version: PackageJson.version })
)
