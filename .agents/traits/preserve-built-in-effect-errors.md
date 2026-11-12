---
name: preserve-built-in-effect-errors
subject: "Wrapping and mapping built-in Effect errors. In TypeScript or TSX
  files. Exception: When every custom error or error mapping under assessment is
  needed for recovery or a meaningful external boundary (as defined in the
  assertion), or is required by whole-operation-operational-error-boundaries,
  rather than merely wrapping a built-in Effect error."
assertion: "Preserve Effect’s built-in error types and let errors propagate
  naturally: prefer `fs.readFileString(file)` over
  `fs.readFileString(file).pipe(Effect.mapError(wrapError))`. Avoid custom error
  types or error mapping unless needed for recovery or a meaningful external
  boundary. A meaningful external boundary is any of: (1) a public package
  export or a service/plugin contract implemented elsewhere; (2) a transport
  adapter mapping to a serializable failure schema; (3) a user- or agent-facing
  message with remediation the built-in error lacks, such as a file to create
  or a command to run; (4) redaction of sensitive inputs or causes; (5) keeping
  an operation's own failures distinct from caller-supplied errors it passes
  through; (6) a process boundary that gives failures runtime behavior the
  existing errors lack, such as a documented exit code set via
  Runtime.errorExitCode. NOT a meaningful boundary: generic text such as \"check your network
  and retry\", or repeating a path/URL the built-in error already carries."
purpose: Preserve established error information and interoperability without
  unnecessary custom error layers.
---
This uses the same boundary definition as avoid-unnecessary-operation-error-wrappers.

```diff
-const read = fs.readFileString(file).pipe(Effect.mapError(wrapError))
+const read = fs.readFileString(file)
```

Violation: wrapping `HttpClientError` into a generic error discards its request/response detail and adds no remediation.

```ts
client.get(url).pipe(
  Effect.mapError((cause) => FetchError.make({ cause, message: "Network request failed" })),
)
```

Fine: the message tells the user exactly what to do, which `PlatformError` cannot.

```ts
fs.readFileString(configPath).pipe(
  Effect.mapError((cause) =>
    ConfigError.make({ cause, message: "Create .agents/traits/_traits.json with a `traits` array, or run `traits update`" })
  ),
)
```

Also fine: mapping a `SchemaError` from decoding credentials to `InvalidAccountsError.make({ path })` so secret input is not retained (redaction), and converting a CLI operation's failures to `CliError.UserError({ cause, userMessage })` whose message identifies the user's file and the specific things to fix there (format, ownership, permissions, disk space), keeping the original cause.
