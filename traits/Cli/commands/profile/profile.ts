import { Command } from "effect/cli"

import { create } from "./create.ts"
import { list } from "./list.ts"
import { remove } from "./remove.ts"
import { show } from "./show.ts"
import { use } from "./use.ts"

export const profile = Command.make("profile").pipe(
  Command.withDescription("Manage user-level model profiles"),
  Command.withSubcommands([create, list, show, use, remove])
)
