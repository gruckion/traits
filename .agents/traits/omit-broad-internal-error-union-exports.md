---
name: omit-broad-internal-error-union-exports
subject: Exported error aliases in explicit Effect service contracts.
assertion: Do not export an error alias used only to repeat a broad service-wide
  error union internally.
purpose: Avoid exposing redundant catch-all error abstractions that obscure
  operation-specific failure contracts.
---
