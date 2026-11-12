---
name: required-services-for-explicitly-provided-dependencies
subject: Effect dependencies always supplied by application composition or
  configuration layers.
assertion: Use Context.Service rather than Context.Reference when the dependency
  must be explicitly provided. Keep configuration defaults in the configuration
  schema; use Context.Reference only when absence of a provider is intentionally
  supported through a fallback.
purpose: Make required wiring visible in Effect's dependency types and avoid
  redundant or silently applied fallback values.
---
