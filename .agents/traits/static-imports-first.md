---
name: static-imports-first
subject: Static module import declarations. Applies when adding or reorganizing
  static module imports. In TypeScript, TSX, JavaScript, or JSX files.
assertion: 'Place all static import declarations at the top of a module, before
  executable statements and other declarations: import { Layer } from "effect"
  before export default ..., never after it. Dynamic import() expressions may
  remain where needed.'
purpose: Make module dependencies easy to discover before reading declarations
  and executable behavior.
---
```diff
-export const value = 1
 import { Layer } from "effect"
+export const value = 1
```
