---
name: generic-mcp-initialization-diagnostics
subject: Final MCP startup-failure diagnostics.
assertion: For final MCP startup-failure reporting, use generic Effect cause
  formatting instead of error-class-specific extraction, so the coding agent
  receives diagnostics for arbitrary failures and defects. This reporting
  convention does not change domain error types or parsing-error modeling.
purpose: Preserve useful startup diagnostics for arbitrary failures rather than
  only anticipated error classes.
---
```diff
-const details = error instanceof Config.ConfigError ? selectedConfigFields(error) : genericMessage
+const details = Cause.pretty(cause)
```
