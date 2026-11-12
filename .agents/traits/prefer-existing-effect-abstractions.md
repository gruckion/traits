---
name: prefer-existing-effect-abstractions
subject: Custom utilities and infrastructure potentially provided by Effect or
  its platform packages. For user-facing failures in Effect CLI command
  handlers, apply the dedicated CLI user-error and domain-error rendering
  requirements instead.
assertion: Check the installed Effect APIs and source for suitable existing
  abstractions before implementing custom equivalents. Reuse a built-in when its
  semantics meet the requirements; retain custom code where a concrete
  requirement is not covered.
purpose: Avoid maintaining redundant infrastructure and benefit from the
  library's established behavior.
---
For example, prefer UserDirectories from effect/persistence over hand-written platform and XDG directory resolution, and a suitable built-in schema over a custom refinement.