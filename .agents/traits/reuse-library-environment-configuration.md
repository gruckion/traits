---
name: reuse-library-environment-configuration
subject: Integrations with an existing library-provided environment configuration API.
assertion: Prefer the library's environment-based configuration when it meets
  the integration's requirements. Do not add duplicate CLI flags, configuration
  parsing, or override-precedence logic unless a distinct requirement calls for
  them.
purpose: Keep configuration minimal and reuse the library's standard behavior
  instead of maintaining redundant configuration paths.
---
