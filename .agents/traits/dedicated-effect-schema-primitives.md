---
name: dedicated-effect-schema-primitives
subject: Effect schema definitions expressing standard validation constraints.
assertion: Prefer dedicated built-in Effect schemas over equivalent manually
  composed checks when they preserve the intended validation and inferred type.
  For example, use S.NonEmptyArray instead of S.Array plus a minimum-length-one
  check, S.NonEmptyString instead of S.String plus a nonempty check, and
  S.Natural instead of S.Int plus a nonnegative check. Keep additional
  constraints that the dedicated schema does not express, including rejection of
  whitespace-only strings or upper bounds.
purpose: Express intent directly, reduce redundant checks, and preserve stronger
  inferred types where available.
---
