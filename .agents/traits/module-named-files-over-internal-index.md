---
name: module-named-files-over-internal-index
subject: Filenames for internal modules, directory entry modules, and barrels.
assertion: Use the module's name instead of index.ts for internal modules,
  including barrels and the core module of a directory representing that module.
  Keep a directory's core module inside that directory, such as Cli/Cli.ts or
  auth/auth.ts. Reserve index.ts for entrypoints exposed as package exports;
  being a barrel alone does not justify index.ts. Whether a file is a package
  entry point is stated by the package-exports enrichment, derived from its
  nearest package.json; an index.ts it reports as an entry point complies. Update
  imports when renaming.
purpose: Make module identity and ownership visible in filenames and import
  paths while preserving package export entrypoints.
enrichments:
  - ./_enrichments/package-exports.ts
---
```diff
-import { Cli } from "./Cli/index.ts"
+import { Cli } from "./Cli/Cli.ts"
```

A module directory owns its entry file: use auth/auth.ts rather than a sibling auth.ts.

When the directory already has a core module of that name, that module also hosts the barrel's re-exports, as Profile/Profile.ts does with `export * from "./ProfileName.ts"`. If a re-exported module imports the core module's runtime values, break the cycle first, for example with `S.suspend`.
