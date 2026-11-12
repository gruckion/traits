---
name: context-service-use-over-flatmap
subject: Effectful callbacks applied directly to an Effect Context service lookup.
assertion: Use the Context service's .use(callback) accessor instead of
  Service.pipe(Effect.flatMap(callback)), pipe(Service,
  Effect.flatMap(callback)), or Effect.flatMap(Service, callback) when the
  operation simply retrieves that service and runs an effectful callback. This
  includes callbacks that return yieldable schema errors. Keep ordinary flatMap
  composition for non-service effects, and retain generator service yields when
  the service is needed across multiple steps.
purpose: Express service-dependent operations directly without redundant
  pipeline ceremony or custom accessor helpers.
---
```ts
Effect.catch((cause) =>
  WorkspacePaths.use((paths) =>
    AccountsReadError.make({ path: paths.accounts, cause })
  )
)
```