---
name: avoid-unnecessary-operation-error-wrappers
subject: Custom operation-specific error wrappers in Effect code, i.e. custom
  errors constructed from an existing failure via mapError, catch, catchTag, or
  an Effect.try/tryPromise catch. Excludes errors raised for new conditions
  (e.g. Effect.filterOrFail, Effect.fail on a rejected value) and error channels
  of abstract service/plugin contracts (see
  operation-specific-service-error-channels).
assertion: "Do not introduce a custom wrapper where the existing error suffices.
  A wrapper is justified only when it is needed for recovery (callers
  distinguish it from other failures) or for a meaningful external boundary.
  A meaningful external boundary is any of: (1) a public package export or a
  service/plugin contract implemented elsewhere; (2) a transport adapter
  mapping to a serializable failure schema (e.g. an MCP tool or RPC failure);
  (3) a user- or agent-facing message with remediation the built-in error
  lacks, such as a file to create or a command to run; (4) redaction, e.g.
  deliberately dropping a cause that could retain secrets or sensitive input;
  (5) keeping an operation's own failures distinct from caller-supplied errors
  it passes through; (6) a process boundary that gives failures runtime
  behavior the existing errors lack, such as a documented exit code set via
  Runtime.errorExitCode. NOT a meaningful boundary: generic text such as \"check
  your network and retry\", or repeating a path/URL the built-in error already
  carries."
purpose: Avoid redundant error abstractions that obscure useful existing failure
  information.
---
A wrapper's mere availability does not justify replacing adequate existing errors. Judge each wrapper against the boundary list above; a file may contain both justified and unjustified wrappers.

Violation: the wrapper adds nothing the built-in `PlatformError` lacks.

```ts
const read = fs.readFileString(path).pipe(
  Effect.mapError((cause) => ReadFailed.make({ path, cause, message: `Failed to read ${path}` })),
)
```

Violation: generic retry advice over an `HttpClientError`.

```ts
Effect.mapError((cause) => NetworkError.make({ cause, message: "Network failed; check your connection and retry" }))
```

OK (not a wrapper): an error raised for a new condition.

```ts
Effect.filterOrFail((exit) => exit === 0, (exit) => GitFailed.make({ exit }))
```

OK (remediation): `Effect.mapError((cause) => ConfigMissing.make({ cause, message: "Create .agents/traits/_traits.json with …" }))`.

OK (remediation): converting a CLI operation's failures to `CliError.UserError({ cause, userMessage })` whose message identifies the user's file and the specific things to fix there (format, ownership, permissions), keeping the original cause.

OK (redaction): `Effect.mapError(() => LoadFailed.make({ module }))` that deliberately drops a `SchemaError` whose message could echo secret values.

OK (distinct stage): a lock helper failing with `LockError` for its own acquire/release stages while passing the caller's effect errors through unchanged.

OK (transport/contract): an MCP tool handler mapping failures into its declared failure schema; a service interface declaring `StoreError` in its method signatures.

OK (process boundary): `Effect.mapError((error) => CheckError.make({ message: error.message }))` where `CheckError` sets `[Runtime.errorExitCode] = 2`, because the command documents exit 2 for a check that could not run and the original errors would exit 1.
