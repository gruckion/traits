---
name: development-dependencies-in-tooling-workspace-roots
subject: Dependencies of private monorepo root packages used only for repository
  tooling and development.
assertion: Declare root-only tooling and development dependencies in
  devDependencies rather than dependencies. Keep runtime dependencies in the
  workspace packages that actually require them.
purpose: Make the private root package's development-only role explicit without
  misclassifying workspace runtime requirements.
---
