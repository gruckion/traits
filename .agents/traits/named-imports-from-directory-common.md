---
name: named-imports-from-directory-common
subject: Imports from directory-specific _common utility modules.
assertion: Import the specific exports used from directory-specific _common
  modules with named imports rather than namespace imports, even when more than
  two exports are used or multiple exports would otherwise have aliases sharing
  a module-name prefix.
purpose: Keep directory-local helper usage direct and avoid generic namespace
  qualification.
---
Use named imports rather than namespaces such as `* as Shared` or `* as Common`.

```ts
import { commonFlags, readApiKey, saveAccount } from "./_common.ts"
```