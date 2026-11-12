---
name: service-colocated-effect-layer-naming
subject: Effect layer exports and the placement of environment-specific service
  implementations.
assertion: Keep potentially environment-specific layer implementations in their
  owning service module, even when no alternative implementation exists yet; use
  layerFrom<InputSource>, such as layerFromFs. Export a module's unqualified
  primary layer for its core service as layer. Include a service or role in the
  export name only when the module provides layers for multiple services or
  roles and the shorter name would be ambiguous. Place implementation or backend
  qualifiers after the service or role, and append From<InputSource> when
  constructed from a particular input source. Use layer[FromInputSource] or
  layer<ServiceOrRole>[Implementation][FromInputSource]. Avoid XLive, XLayer,
  layerFooConfig, and layerFooEnv.
purpose: Keep layer ownership discoverable and names concise while making
  environment-specific construction explicit.
---
```ts
// Module's core service
layer
layerFromFs
layerFromConfig
layerFromEnv

// Multiple services or roles in one module
layerFoo
layerFooFromConfig
layerFooFromEnv
layerStoreRedis
layerStoreRedisFromConfig
```

```diff
-import { layerUserConfigLockFromFs } from "./UserConfigLock/layerUserConfigLockFromFs.ts"
+import * as UserConfigLock from "./UserConfigLock/index.ts"

-layerUserConfigLockFromFs
+UserConfigLock.layerFromFs
```