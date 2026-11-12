---
name: align-operation-module-and-export-names
subject: Operation-focused modules and their primary exports. Applies when
  naming or renaming an operation-focused module and its primary export. In
  TypeScript, TSX, JavaScript, or JSX files.
assertion: For operation-focused modules, keep the filename and primary export
  aligned with the operation's canonical name. When improving that name, rename
  the file and export together and update consumers to import it directly,
  rather than retaining the old source name behind an import alias.
purpose: Make operations easy to locate and recognize without tracing aliases
  across modules.
---
```diff
-import { evaluate as check } from "./evaluate.ts"
+import { check } from "./check.ts"
```
