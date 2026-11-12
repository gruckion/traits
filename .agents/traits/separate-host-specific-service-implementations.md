---
name: separate-host-specific-service-implementations
subject: Effect service-shape modules and concrete layers across an explicit
  host-specific dependency boundary. Only where an explicit architectural
  boundary requires this decoupling, such as keeping CLI filesystem setup out of
  a service contract intended for headless hosts. This is not a blanket
  requirement to separate every service from its layers.
assertion: Keep concrete layer implementations in separate host-owned modules
  when the service-shape module must remain decoupled from that host. Do not
  import or re-export the concrete layer, or its implementation-only
  dependencies, from the service-shape module, even through a colocated layer
  definition. Keep the Context service and shared contract errors in the service
  module. Give the implementation module a descriptive name and export its
  primary layer as layer.
purpose: Prevent implementation dependencies from leaking into service contracts
  that other hosts must consume independently.
---
For example, UserConfigStore/UserConfigStore.ts defines the service shape and shared operation errors. Cli/FsUserConfigStore.ts exports layer and owns the FileSystem, Path, WorkspacePaths, and UserFileSecurity dependencies needed by that implementation; the service-shape module must not import those implementation-only dependencies.