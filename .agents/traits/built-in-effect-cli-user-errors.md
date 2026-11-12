---
name: built-in-effect-cli-user-errors
subject: Message-only user-facing failures in Effect CLI command handlers.
  Applies when neither a domain-specific error identity (for recovery) nor
  custom runtime behavior, such as a distinct Runtime.errorExitCode, is needed.
assertion: Use CliError.UserError from effect/cli instead of defining a custom
  equivalent error schema.
purpose: Reuse the CLI runner's established error formatting without maintaining
  redundant error schemas.
---
```diff
-import { CliError } from "../CliError.ts"
+import { CliError } from "effect/cli"

-return yield* CliError.make({ message: `Unknown account: ${account}` })
+return yield* CliError.UserError.make({ cause: `Unknown account: ${account}` })
```

`CliError.UserError` always exits with code 1. A custom error class that sets `[Runtime.errorExitCode] = 2` (e.g. to keep a documented exit-code contract where 1 means something else) is not an equivalent and is not a violation. A custom message-only error with no such behavior is.
