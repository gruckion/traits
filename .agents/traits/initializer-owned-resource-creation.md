---
name: initializer-owned-resource-creation
subject: Access to resources whose initialization contract permits creation when absent.
assertion: Let the owning initializer create absent resources and expose the
  normal empty state where applicable, rather than adding existence prechecks
  and missing-resource errors for that valid initial state. For
  filesystem-backed resources, keep required parent-directory creation in the
  initializer.
purpose: Avoid redundant missing-resource handling and centralize first-use setup.
---
