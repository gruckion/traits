---
name: prefer-public-barrel-imports
subject: Imports of APIs re-exported by a package’s public barrel modules.
assertion: Prefer importing through the appropriate public package or subpackage
  barrel instead of a deeper module path when that barrel exports the needed
  API. Use namespace-qualified types when the barrel exports a module namespace
  rather than the type directly. Retain deeper imports when necessary for
  correctness or to avoid material runtime or bundling costs.
purpose: Keep imports concise and aligned with the package’s public API boundaries.
---
