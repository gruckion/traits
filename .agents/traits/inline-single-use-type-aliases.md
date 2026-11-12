---
name: inline-single-use-type-aliases
subject: Small private TypeScript type aliases used in only one place.
assertion: Inline a small private type alias at its sole use unless its name
  materially improves readability or defines a meaningful domain or API
  boundary. Check neighboring aliases for the same simplification.
purpose: Avoid unnecessary type indirection while preserving useful named contracts.
---
