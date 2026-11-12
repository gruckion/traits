import { Cache, Context, Effect, Exit, Fiber, flow, Path, Predicate, Schema as S, Scope } from "effect"
import { Chat } from "effect/ai"

import * as ExtensionModule from "./ExtensionModule.ts"
import { HostServices } from "./ExtensionServices.ts"
import type { WorkspacePath } from "./util/util.ts"
import { WorkspaceRoot } from "./WorkspaceRoot.ts"

/** Shares program-scoped setup outcomes and provides isolated execution resources; modules load from the workspace root. */
export const make = Effect.fnUntraced(function* <A, E, E2>(
  result: S.ConstraintDecoder<A>,
  error: S.Constraint & { readonly Type: E },
  executionError: S.Constraint & { readonly Type: E2 }
) {
  const scope = yield* Scope.Scope
  const { directory } = yield* WorkspaceRoot
  const path = yield* Path.Path
  const services = yield* Effect.context<HostServices>().pipe(Effect.map(Context.pick(...HostServices)))
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideContext(services), Effect.provideServiceEffect(Chat.Chat, Chat.empty))
  const setups = yield* Cache.make({
    capacity: Infinity,
    lookup: Effect.fnUntraced(
      function* (module: WorkspacePath) {
        const child = yield* Scope.fork(scope)
        const url = yield* path.toFileUrl(path.join(directory, module)).pipe(Effect.orDie)
        return ExtensionModule.load(url, result, error).pipe(
          provide,
          Scope.provide(child),
          Effect.onError((cause) => Scope.close(child, Exit.failCause(cause)))
        )
      },
      Effect.flatten,
      Effect.forkIn(scope)
    )
  })
  return {
    get: (module: WorkspacePath) => Cache.get(setups, module).pipe(Effect.flatMap(Fiber.join)),
    run: flow(provide, Effect.scoped, Effect.catchIf(Predicate.not(S.is(executionError)), Effect.die))
  }
})
