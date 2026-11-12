import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, Layer } from "effect"

import { ProjectPaths } from "../../ProjectPaths.ts"
import * as TraitProjectLock from "../../TraitProjectLock.ts"

Effect.gen(function* () {
  yield* TraitProjectLock.acquire
  yield* Console.log("ready")
  return yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide([
    NodeServices.layer,
    Layer.succeed(ProjectPaths, { projectRoot: process.argv[2]!, traitsDirectory: process.argv[2]! })
  ]),
  NodeRuntime.runMain
)
