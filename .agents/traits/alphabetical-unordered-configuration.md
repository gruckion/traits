---
name: alphabetical-unordered-configuration
subject: Configuration lists and fields whose ordering has no semantic
  significance. Applies when editing configuration lists or fields whose
  ordering has no semantic significance. In TypeScript, JavaScript, JSON, YAML,
  or TOML files.
assertion: 'Prefer alphabetical ordering for miscellaneous configuration lists
  and fields when their order has no semantic significance: projects:
  ["oxlints/vite.config.ts", "traits.sh/vite.config.ts",
  "traits/vite.config.ts"]. Preserve intentional dependency, execution,
  precedence, and user-facing order rather than sorting those blindly.'
purpose: Make unordered configuration easy to scan and reduce incidental diff
  churn without changing execution semantics.
---
```diff
-projects: ["traits/vite.config.ts", "oxlints/vite.config.ts"]
+projects: ["oxlints/vite.config.ts", "traits/vite.config.ts"]
```
