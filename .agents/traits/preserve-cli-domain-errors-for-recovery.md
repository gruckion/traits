---
name: preserve-cli-domain-errors-for-recovery
subject: User-facing domain-specific failures in Effect CLI command handlers.
  Applies when code in the same handler, or a caller of the exported handler,
  catches the domain error by tag or type.
assertion: Preserve the domain-specific error and expose its display text
  through CliError.userMessage rather than wrapping it solely for rendering.
purpose: Preserve meaningful domain error identities while using the CLI
  runner's error formatting.
---

Not a violation: wrapping into an error that sets `Runtime.errorExitCode` or another runner-visible behavior to implement a documented exit-code contract, which `CliError.userMessage` cannot do.
