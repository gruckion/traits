---
name: fixed-error-messages-on-error-types
subject: Messages intrinsic to an error type.
assertion: Define messages intrinsic to an error type on that error type rather
  than requiring callers to repeat them in constructor props. Use a class
  property or getter when schema encoding is unnecessary; when messages must
  remain in encoded tool responses, use a schema constructor default. Keep
  genuinely instance-specific diagnostic data in constructor fields.
purpose: Keep invariant diagnostics consistent and avoid duplicating fixed
  messages at construction sites.
---
```diff
-return MissingHeader.make({ path, message: "Document requires a header" })
+// Define the invariant message on MissingHeader itself.
+return MissingHeader.make({ path })
```

Not a violation: a general error whose message differs per construction site, such as `CheckError.make({ message: error.message })` alongside `CheckError.make({ message: "Pass both --fail and --pass to apply a decision policy." })`. A violation is a type whose every construction repeats the same text, or whose text restates the type's own meaning.
