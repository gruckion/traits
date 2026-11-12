---
name: schema-decoding-defaults-for-configuration
subject: Schema-backed configuration with optional defaults. In TypeScript or TSX files.
assertion: For schema-decoded configuration, express optional-field defaults
  with Effect Schema decoding defaults rather than fallback expressions at
  consumption sites. Decode configuration of unknown type, such as a
  dynamically imported module, with S.decodeUnknownEffect; when the input is
  already typed as the schema's Encoded type, such as JSON text decoded through
  S.fromJsonString, use S.decodeEffect to keep compile-time checking,
  and expose the schema’s Encoded type for caller-authored configuration so
  defaulted fields remain optional. For an optional key, use
  S.withDecodingDefaultKey(Effect.succeed(value)) (key may be omitted but not
  undefined), not S.withDecodingDefault, which also admits undefined.
purpose: Establish configuration defaults once at decoding so consumers can rely
  on a consistent resolved value.
---
```diff
-const limit = config.limit ?? 10
+// Decode with a default once, then read config.limit directly.
+limit: S.Int.pipe(S.withDecodingDefaultKey(Effect.succeed(10)))
```
