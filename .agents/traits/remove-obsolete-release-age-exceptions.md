---
name: remove-obsolete-release-age-exceptions
subject: Dependency release-age exception lists during version upgrades.
assertion: Remove exceptions for superseded dependency versions when adding the
  upgraded version; retain older exceptions only when those versions are still
  required.
purpose: Keep release-age exceptions limited to dependencies still in use.
---
