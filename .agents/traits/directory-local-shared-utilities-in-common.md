---
name: directory-local-shared-utilities-in-common
subject: Utility modules shared only by sibling modules within one directory.
assertion: Name directory-specific shared utility modules _common.ts and
  colocate them with their consumers, rather than using shared.ts, share.ts, or
  generic utilities elsewhere. Keep utilities reused outside that directory in
  an appropriately named shared domain module instead of treating them as
  directory-local helpers.
purpose: Make directory-local sharing explicit and distinguish helpers from the
  directory's primary modules.
---
For example, provider login commands share flags and credential helpers through auth/login/_common.ts.