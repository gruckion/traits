import { Context, type Effect } from "effect"

import type { TraitsConfig } from "./TraitsConfig.ts"

export class TraitsContext extends Context.Service<
  TraitsContext,
  {
    readonly configRoot: string
    readonly config: typeof TraitsConfig.Type
    readonly excludes: ReadonlyArray<string>
    readonly asDecision: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
    readonly asFileRead: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  }
>()("traits-prev/TraitsContext") {}
