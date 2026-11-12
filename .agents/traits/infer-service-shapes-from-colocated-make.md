---
name: infer-service-shapes-from-colocated-make
subject: "Effect services with a colocated construction Effect and a class-owned
  default layer. Only when the intended API encapsulates the default layer as a
  static member of the service class. Does not require converting module-level
  layer exports: modules representing a type or using a namespace-oriented API
  may retain export const layer so consumers can use Module.layer rather than
  Module.Service.layer."
assertion: Prefer Context.Service<Self>()(id, { make }) to infer the service
  shape from its construction Effect, and expose the class-owned default layer
  as static readonly layer = this.make.pipe(Layer.effect(this)). Avoid
  duplicating that inferred shape in an explicit contract solely for the service
  declaration. Retain an explicit contract when it must be independent of the
  implementation. Does not apply to services without a colocated make and
  default layer, i.e. whose only layer is a parameterized factory (static
  readonly layer = (directory) => Layer.effect(...)), or whose shape is
  a documented contract supplied by hosts.
purpose: Keep class-owned service identity, construction and layer together
  without duplicated method and error-channel declarations, while preserving
  intentional module APIs.
---
Violation: a default layer built from a colocated construction Effect, with the shape duplicated.

```ts
export class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()("app/Clock") {
  static readonly layer = Layer.effect(this, Effect.succeed({ now: Effect.sync(() => Date.now()) }))
}
```

Correct:

```ts
export class Clock extends Context.Service<Clock>()("app/Clock", {
  make: Effect.succeed({ now: Effect.sync(() => Date.now()) })
}) {
  static readonly layer = this.make.pipe(Layer.effect(this))
}
```

Out of scope: the only layer is a parameterized factory, so there is no default layer or colocated make; the explicit shape is the documented contract hosts provide.

```ts
/** The canonical workspace directory. */
export class WorkspaceRoot extends Context.Service<WorkspaceRoot, { readonly directory: string }>()("app/WorkspaceRoot") {
  static readonly layer = (directory: string) =>
    Layer.effect(this, FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.realPath(directory)), Effect.map((directory) => ({ directory }))))
}
```
