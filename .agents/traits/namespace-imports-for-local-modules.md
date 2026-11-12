---
name: namespace-imports-for-local-modules
subject: Named imports from local project modules (relative paths) in
  TypeScript, TSX, JavaScript, and JSX files. Excludes, judged from the import
  path itself, imports from any module under a util/ directory (the project's
  schema utilities, e.g. traits/util/util.ts, ./Change.ts inside util/, or
  ../util/Input.ts), from barrel/re-export modules, and from directory-specific
  _common utility modules; these use named imports.
assertion: Use a namespace import with qualified member access when a single
  import statement from one local module names three or more exports, or names
  two or more exports that would otherwise need aliases prefixed with the
  module name (e.g. `parse as parseTrait`, `serialize as serializeTrait`).
  Importing one or two exports without such aliases is fine. Exported names
  that merely share a prefix without aliasing (e.g. `Profile, ProfileName`)
  count only toward the three-export threshold, not as prefixed aliases.
purpose: Make related local exports visibly belong to their module without
  repetitive aliases or crowded named imports.
---
For example, use `import * as Trait from "./Trait.ts"` with `Trait.parse`, `Trait.serialize`, `Trait.Trait`, and `Trait.TraitName`.

Violations:

```ts
// Three exports from one local module.
import { parse, serialize, Trait } from "./Trait.ts"
// Two exports needing module-prefixed aliases.
import { parse as parseTrait, serialize as serializeTrait } from "./Trait.ts"
```

```diff
-import { parse, serialize, Trait } from "./Trait.ts"
+import * as Trait from "./Trait.ts"
```

Correct:

```ts
// Two unaliased exports: below the threshold.
import { GitignoreError, match } from "../Cli/Gitignore.ts"
// Names sharing a prefix, not aliased, only two: fine.
import { Profile, ProfileName } from "./Profile/Profile.ts"
// Module under a util/ directory: excluded regardless of count.
import { Change, ChangeWithAfter, ChangeWithBefore } from "./Change.ts" // inside traits/util/
import { Input, InputRange, InputSource } from "../util/Input.ts"
// Barrel/re-export module: excluded.
import { Enrichment, EnrichmentError, EnrichmentName } from "./index.ts"
```

Imports from external packages are out of scope; see choose-import-style-by-api-cohesion.

An import statement naming one or two exports without aliases never needs a namespace import; count names per import statement, not per file.
