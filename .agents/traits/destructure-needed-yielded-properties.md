---
name: destructure-needed-yielded-properties
subject: Local bindings of object results yielded from Effects or context services.
assertion: Destructure the needed properties directly from the yielded result
  instead of introducing an intermediate object binding that is only accessed or
  immediately destructured. Retain the object when needed as a whole, and
  preserve access timing and receiver binding for getters, live properties, and
  receiver-sensitive methods. This concerns local bindings, not function
  parameters. When a destructured property name collides with an existing
  binding such as a parameter, rename the other binding (e.g. the parameter)
  rather than aliasing the destructured property. Platform service objects
  (FileSystem, Path, ChildProcessSpawner and similar) may stay bound for
  qualified access such as fs.readFileString(file).
purpose: Make dependencies explicit at the binding site without unnecessary
  intermediate names.
---
```diff
-const paths = yield* WorkspacePaths
-const lockPath = paths.lock
+const { lock } = yield* WorkspacePaths
```

Name collision with a parameter: rename the parameter, keep the property name.

```diff
-const save = Effect.fn(function* (directory: string) {
-  const root = yield* WorkspaceRoot
-  return path.join(root.directory, directory)
+const save = Effect.fn(function* (relative: string) {
+  const { directory } = yield* WorkspaceRoot
+  return path.join(directory, relative)
```

Incorrect: `const { directory: rootDirectory } = yield* WorkspaceRoot` (aliasing the destructured property to dodge the parameter).

Allowed: platform service objects stay bound.

```ts
const fs = yield* FileSystem.FileSystem
const path = yield* Path.Path
const text = yield* fs.readFileString(path.join(directory, "a.txt"))
```
