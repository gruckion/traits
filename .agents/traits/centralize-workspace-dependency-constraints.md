---
name: centralize-workspace-dependency-constraints
subject: Dependency version declarations in pnpm workspaces that use catalogs.
assertion: "Define shared dependency version constraints in the workspace
  catalog and reference them with catalog: in package manifests rather than
  duplicating literal version specifications. Preserve intentionally different
  constraints using named catalogs or explicit package-specific exceptions."
purpose: Keep dependency versions centrally maintainable and consistent across
  workspace packages.
---
