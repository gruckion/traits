---
name: compatible-dependency-version-ranges
subject: Dependency version constraints in package manifests and workspace catalogs.
assertion: Prefer compatible semantic-version ranges, such as caret ranges,
  rather than exact version pins when updating dependencies. Retain exact pins
  when a concrete compatibility or tooling constraint requires them.
purpose: Allow compatible future updates without repeatedly changing dependency
  declarations.
---
