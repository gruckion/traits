---
name: schema-validated-configuration
subject: Configuration and numeric domain validation with Effect Schema. Applies
  when loading and validating configuration with Effect Config. In TypeScript or
  TSX files.
assertion: "Validate configuration through Config.schema with appropriate
  schemas and checks, not Config.Number followed by manual conditions. For
  numeric schema fields in configuration and domain records, express both
  numeric kind and domain bounds: use S.Int for integral values and S.Finite
  when fractions are valid, then add positive, non-negative, or range checks
  according to the actual contract. One-based source positions and positive byte
  limits require positive integers. Do not weaken integer fields to S.Finite or
  add redundant finiteness checks to S.Int. Verify platform semantics before
  constraining process exit codes or other externally supplied numbers."
purpose: Reject invalid configuration and numeric domain values at their
  boundaries before they reach consumers.
---
```diff
-const limit = Config.Number("LIMIT")
+const limit = pipe("LIMIT", Config.schema(S.Int.check(S.isGreaterThan(0))))
```
