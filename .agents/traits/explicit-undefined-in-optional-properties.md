---
name: explicit-undefined-in-optional-properties
subject: "Optional TypeScript property declarations. Applies when declaring
  optional properties. In TypeScript or TSX files. Exception: When every
  optional property under assessment intentionally permits omission but
  disallows explicitly passing undefined."
assertion: "For TypeScript optional properties, explicitly include undefined in
  the property type by default: readonly copyable?: boolean | undefined, not
  readonly copyable?: boolean. Omit the undefined union only when the API
  intentionally disallows explicitly passing undefined while still permitting
  omission."
purpose: Make optional-property assignment semantics explicit and convenient for
  callers passing possibly undefined values.
---
```diff
-readonly copyable?: boolean
+readonly copyable?: boolean | undefined
```
