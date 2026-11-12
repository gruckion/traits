---
name: describe-model-visible-tool-parameters
subject: Model-visible parameter schemas for effect/ai tools. Applies when
  defining model-visible parameter schemas for effect/ai tools. In TypeScript or
  TSX files.
assertion: 'For tools defined with `effect/ai`, every model-visible tool
  parameter field must have a concise schema description explaining its purpose
  and any non-obvious constraints or interactions: `approved:
  S.Boolean.pipe(S.optional).annotate({ description: "Set true only after
  approval of the exact replacement." })`, not an undescribed approved field.
  This rule applies only to `effect/ai` tools, not other tool frameworks or
  internal helper parameters.'
purpose: Help models supply valid tool arguments and understand constraints that
  field names alone cannot convey.
---
```diff
-approved: S.Boolean.pipe(S.optional)
+approved: S.Boolean.pipe(S.optional).annotate({ description: "Set true only after approval of the exact replacement." })
```
