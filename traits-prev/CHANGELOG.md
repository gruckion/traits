# traits

## 0.5.14

### Patch Changes

- [#99](https://github.com/crosshatch/traits/pull/99)
  [`ecce011`](https://github.com/crosshatch/traits/commit/ecce0114e28f29e5a53ab72a83b427c33539ddec) -
  Preserve approval for unchanged trait actions after unrelated store changes.
  Reassess relationships before saving and request fresh consent only when the
  proposal or displayed action changes. Serialize derivations per store so
  concurrently approved independent proposals can all be saved.

## 0.5.13

### Patch Changes

- [#97](https://github.com/crosshatch/traits/pull/97)
  [`dd0c930`](https://github.com/crosshatch/traits/commit/dd0c930a58f0d168251e0b76fab7c428f9749aab) -
  Preserve independent pending trait proposals so approving one does not
  invalidate another merely because it was proposed later. Continue requiring
  fresh approval when the proposal or trait store changes.

## 0.5.12

### Patch Changes

- [#94](https://github.com/crosshatch/traits/pull/94)
  [`dd98ae1`](https://github.com/crosshatch/traits/commit/dd98ae13e4e65cc28f6611e8377ed4626691c35b) -
  Stop configuring and recommending the optional reflection MCP server during
  standard Traits setup.

## 0.5.11

### Patch Changes

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Store the shared trait index and reflection data at
  `.agents/traits/traits.sqlite`. Document a colocated `.gitignore` for the
  database and SQLite sidecar files.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Consolidate shared MCP workflow instructions and shorten tool descriptions and
  the agent skill. Preserve approval, scope, remediation, and recovery guidance
  while removing duplicated prose and internal implementation details.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Hydrate the trait index after watcher readiness to avoid a duplicate startup
  scan. Cache exact unchanged evaluations with bounded capacity and expiry, and
  isolate each tool invocation in its own root trace.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Return compact, file-grouped check reports with shared trait definitions,
  source chunks, and full-file snapshot revisions. The check_traits success
  response is now { traits, files } instead of a flat evaluation array.
  Assessments and review coverage are preserved; the raw TraitEvaluation API
  remains unchanged.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Run the default Traits MCP server directly in the CLI process. Scope the local
  collector outside the server and exporters so shutdown flushes telemetry
  before closing the collector. Keep external-command execution on `traits run`.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Simplify local telemetry to JSON-only OTLP ingestion and individual span/log
  rows with complete record and resource/scope JSON. Replace inspection filters
  with the reflection MCP SQL query tool, returning JSON rows. Remove protobuf
  decoding and descriptor generation. Retain legacy export batches without
  migrating them.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Update workspace dependencies with compatible version ranges, including Effect
  4.0.6 and the latest Drizzle release candidates. Adapt error schemas and
  tooling to the updated Effect checks, preserving existing error payloads.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Add telemetry subcommands to the traits CLI to collect child-process OTLP
  traces and logs in a worktree-local SQLite database, with a required section
  ID for grouping script runs and SQL queries for listing, searching, and
  filtering stored telemetry.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Name the local telemetry API reflection, with implementation under
  `traits/reflection/` and shared storage at `.agents/traits/traits.sqlite`.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Replace the SQL query CLI command with `traits reflection`, a separate stdio
  MCP server exposing only the query tool. It accepts SQL and returns JSON rows
  from the worktree database without loading trait model configuration.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Simplify command execution using Effect's scoped process spawner. Preserve
  normal child exit codes and keep the collector alive during child cleanup.
  Interruption uses standard SIGTERM process-group cleanup instead of exact
  signal forwarding and re-emission. Inline run implementation into its CLI
  command.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Rename the identifier payload field on TraitNotFoundError and
  TraitAlreadyExistsError from name to traitName, preserving Error.name for the
  error type. Consumers of these error payloads should read traitName instead.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Launch the Traits MCP server with reflection for worktree-local traces and
  logs, and document CLI inspection for bottlenecks and errors.

  Use standard OTEL environment configuration instead of the custom OTLP
  endpoint flag.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Bundle telemetry ingestion and inspection into the traits package and CLI.
  Bare traits starts the instrumented MCP server; run and reflection handle
  telemetry without loading model configuration. Use one worktree-local SQLite
  database and complete Drizzle schema for trait definitions, runs, spans, and
  logs, preserving existing telemetry at its current path. Consolidate telemetry
  tests into the Traits suite and remove the standalone telemetry package.

- [#91](https://github.com/crosshatch/traits/pull/91)
  [`e6d6034`](https://github.com/crosshatch/traits/commit/e6d603480cfe3d892e4eab8edbe976998f98d9df) -
  Launch package-manager command shims through cmd.exe on Windows. Inline OTLP
  record ingestion into the receiver. Improve cross-platform test shutdown,
  startup-failure diagnostics, and temporary libSQL database cleanup, and
  reapply Effect tooling patches in the latest-dependency CI job.

## 0.5.10

### Patch Changes

- [#85](https://github.com/crosshatch/traits/pull/85)
  [`eb1dd94`](https://github.com/crosshatch/traits/commit/eb1dd94b30d6c0d996e728a9ba212a03eb78693b) -
  Index Markdown traits in a disposable local libSQL database through Drizzle's
  Effect driver, with startup schema push and database-only runtime reads.

  Populate the fresh index during project initialization and automatically
  synchronize external Markdown edits and approved schema repairs with a scoped,
  debounced directory watcher. Rebuilds validate all files before
  transactionally replacing rows. Mutations perform explicit SQL
  insert/update/delete alongside atomic Markdown publication and finish
  write-through before returning. Dirty or failed synchronization is retried
  before reads; clean reads use SQLite only. Watcher failures are reported and
  retried without a model-facing refresh tool.

  Allow `decisionConcurrency: "unbounded"` to disable the decision request
  limit.

  Reject a second MCP server for the same canonical trait directory using an
  OS-backed SQLite ownership lock, automatically released on process exit.

  Return unexpected handler failures and defects as declared MCP tool errors
  while preserving domain recovery messages and cancellation. Use a single
  declared tool-error envelope instead of separately classifying and encoding
  domain errors.

  Omit absent optional fields when reconstructing cached traits so MCP findings
  remain JSON-compatible instead of failing structured-result serialization.

  Scope post-save reviews to the current task, document checkpoint-based
  verification, and reuse unchanged pending approval assessments while requiring
  fresh consent after proposal or store changes.

  Resolve project paths once and inject them into storage, locking, and
  configuration so subdirectory launches use the correct worktree root.

  Consolidate advisory guidance into Markdown context, removing the separate
  domain/tool/database field. Reject outdated frontmatter for consent-based
  migration instead of silently converting legacy guidance on read.

  Use bounded repository decision concurrency and preserve native
  transport-error diagnostics before AI-provider error conversion.

  Use Effect's standard cause formatting and source-level Redacted values
  instead of custom recursive diagnostic formatting and heuristic secret
  scrubbing.

  Recognize reasoned, exact-name trait exceptions in leading single-line HTML
  comments as well as line-comment headers, while rejecting malformed or late
  directives.

## 0.5.9

### Patch Changes

- [#80](https://github.com/crosshatch/traits/pull/80)
  [`e7bbd5a`](https://github.com/crosshatch/traits/commit/e7bbd5aa7a872116a276fae7053ead2c1b2aeb41) -
  Recommend OpenRouter as the default provider for decisions and language
  generation, with separate TypeSafe and OpenAI providers as an advanced option.

- [#79](https://github.com/crosshatch/traits/pull/79)
  [`699c4f7`](https://github.com/crosshatch/traits/commit/699c4f7f190390656e83c3e36683584a8cb7c696) -
  Include the README in the published package.

## 0.5.8

### Patch Changes

- [#72](https://github.com/crosshatch/traits/pull/72)
  [`e6fdfb9`](https://github.com/crosshatch/traits/commit/e6fdfb90a4d673211ccb2a578ee3365ebfe3bdbb) -
  Replace body-centric traits with required subject, requirement, and purpose
  fields, optional natural-language applicability and guidance, and optional
  Markdown context. Reject unsupported frontmatter instead of silently
  discarding it.

  This changes the stored format and SDK/MCP contracts. Explicitly migrate older
  collections to the new fields and reconnect the MCP server. Parse errors
  provide migration guidance without rewriting files. `derive_trait` now accepts
  a complete trait object as `proposedTrait`; `check_traits` optionally accepts
  invocation circumstances.

  Stored-trait parse errors now direct clients to request developer consent
  before repairing the affected store, validate repaired traits, and retry the
  blocked operation without restarting the server. Diagnostics distinguish
  schema mismatches from malformed documents and require clarification for
  ambiguous repairs.

- [#73](https://github.com/crosshatch/traits/pull/73)
  [`5365a85`](https://github.com/crosshatch/traits/commit/5365a85f5e47e90444aa7cd46c254143ff822f22) -
  Allow compatible Effect 4.x releases in peer dependencies.

## 0.5.7

### Patch Changes

- [#67](https://github.com/crosshatch/traits/pull/67)
  [`76b6023`](https://github.com/crosshatch/traits/commit/76b6023dc4fc1b50745709ea8aba2eed4793576d) -
  Make whole-project trait checks an explicit completion requirement after
  creating, updating, or resolving traits. Align returned instructions, tool
  descriptions, MCP server instructions, and bundled skill documentation while
  preserving approval safeguards and keeping checks agent-driven.

## 0.5.6

### Patch Changes

- [#65](https://github.com/crosshatch/traits/pull/65)
  [`cc2f69e`](https://github.com/crosshatch/traits/commit/cc2f69e9645515eb8c0d4da6ff63bee3134c612b) -
  Return explicit project-wide review and remediation instructions after
  creating, updating, or resolving traits.

## 0.5.5

### Patch Changes

- [#60](https://github.com/crosshatch/traits/pull/60)
  [`bf32233`](https://github.com/crosshatch/traits/commit/bf322334f96722e23488ef6968e0b21938679229) -
  Accept caller-supplied applicability metadata without an extra model call.
  Include it in relationship checks and approval previews, and prevent stale
  applicability from surviving clarification or reconciliation.

  Group domain applicability and extension metadata into explicit objects. The
  derive tool accepts a complete applicability object; Markdown encoding and
  decoding handle flat frontmatter at the storage boundary.

## 0.5.4

### Patch Changes

- [#56](https://github.com/crosshatch/traits/pull/56)
  [`8ebd418`](https://github.com/crosshatch/traits/commit/8ebd4188eb9a8d81d151df6f44d7a36348968767) -
  Expose configuration-error fallbacks as derive_trait and check_traits with
  their normal descriptions and parameters so clients surface startup failures.
  Include instructions to retry the identical trait derivation after fixing
  configuration and restarting the server.

## 0.5.3

### Patch Changes

- [#54](https://github.com/crosshatch/traits/pull/54)
  [`e9a5b1d`](https://github.com/crosshatch/traits/commit/e9a5b1d4e3b4de05f9c40ae2c806b430ca586ade) -
  Keep the MCP connection alive after configuration failures and expose an
  actionable diagnostic tool with restart instructions.

  Report stored trait parsing failures with original diagnostics and
  instructions to migrate all traits to the installed schema without stopping
  the MCP server.

## 0.5.2

### Patch Changes

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Batch independent trait assessments against shared source chunks to reduce
  decision-model requests and repeated source tokens. Bound batches by question
  count and UTF-8 size while preserving name mapping, per-trait results, and
  semaphore-limited HTTP concurrency. Fail oversized inputs and incomplete
  provider answers explicitly instead of truncating or silently skipping checks.

- [#30](https://github.com/crosshatch/traits/pull/30)
  [`e624bdc`](https://github.com/crosshatch/traits/commit/e624bdcfe77a7eb265a0627f9b9d8e409daca1be) -
  Allow configuring decision model concurrency with an optional
  decisionConcurrency setting that defaults to 4. Apply configuration defaults
  during schema decoding.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Construct complete trait records directly with their schema constructor and
  explicit unique names, without an identifier-generating wrapper.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Define intrinsic error messages on their error types instead of repeating them
  at construction sites. Messages are class overrides, not constructor fields.
  Tool response schemas retain encoded messages and structured diagnostic
  fields.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Extract generic schema-driven YAML envelope parsing and serialization into
  _util/Frontmatter. Parsing requires `{ text, path }` and preserves schema
  decoding services. Trait.parse now requires a diagnostic path; document errors
  use generic MissingFrontmatterError, UnterminatedFrontmatterError, and
  InvalidYamlError tags.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Use descriptive kebab-case names without redundant trait- prefixes for trait
  frontmatter and name-only filenames. Update naming validation, model guidance,
  examples, and migration instructions. Migrate the repository's saved names and
  name-based ignores while preserving trait bodies.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Use a provider-compatible structured response for reconciliation extension
  metadata and retain omitted metadata when replacing a single original trait.
  Keep coverage checks focused and explicitly opt-in, using the real decision
  model instead of predetermined model-answer mocks without broad end-to-end
  workflow coverage.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Match file-scoped trait ignore directives by exact unique trait name. Use a
  name-based exception in the CLI launcher and document rename behavior and
  migration guidance.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Simplify assessment result construction by removing per-result Effects and
  spans. Keep batch-level tracing, assessment output, request limits, and
  concurrency unchanged. Remove the unused single-trait evaluate helper; use
  evaluateAll with a one-element array.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Replace generic trait parsing and synthetic storage failures with
  situation-specific tagged errors carrying actionable file, trait name, and
  YAML position context. Add contextual assessment-size and Git-listing
  failures, preserve native operational and validation errors, and expose
  concrete failure schemas through both MCP tools. Return declared failures as
  encoded MCP errors so context is not reduced to message text, while keeping
  provider request metadata private.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Support YAML frontmatter in traits, exposing when, MIME, and skip metadata
  with unique descriptive kebab-case names as identities. Use name-only Markdown
  filenames in the filesystem adapter; the storage service uses names
  independently of its backend and preserves full trait metadata.

  Independently verify full coverage against saved bodies and applicability
  metadata before returning Covered. Route coverage gaps through approval-gated
  reconciliation and preserve metadata in generated replacements.

- [#33](https://github.com/crosshatch/traits/pull/33)
  [`6cf5efb`](https://github.com/crosshatch/traits/commit/6cf5efbe46ba29dfa95e59009e334ef0d1124134) -
  Declare stored, frontmatter, and generated trait schemas from shared field
  definitions using Effect VariantSchema. Use the named generated schema for
  reconciliation instead of deriving field subsets inside the tool flow.

- [#53](https://github.com/crosshatch/traits/pull/53)
  [`7f57812`](https://github.com/crosshatch/traits/commit/7f57812449b0a0e8ad2d102687fe0a363264a009) -
  Store optional BAD-to-GOOD diff examples separately from trait bodies,
  serialize them as fenced diffs after frontmatter, and include them in trait
  derivation and approval.

- [#52](https://github.com/crosshatch/traits/pull/52)
  [`0ccdabb`](https://github.com/crosshatch/traits/commit/0ccdabb7cae2df20f5b92db66ce0a1424a1f8230) -
  Use unique trait names as canonical identity instead of UUIDs. Store traits as
  `<name>.md` without an `id` frontmatter field, select focused reviews with
  `traitNames`, and match ignore directives by exact name. Reject duplicate
  names and protect unaffected traits during reconciliation. See
  MIGRATE_TRAITS.md for migrating existing collections and references.

## 0.5.1

### Patch Changes

- [#22](https://github.com/crosshatch/traits/pull/22)
  [`efd68c2`](https://github.com/crosshatch/traits/commit/efd68c29c9b67a5a7f331980f5fcc66f5c54f1d7) -
  Install checkout dependencies before starting the CLI and support targeted
  `traits-ignore-file` exceptions during file reviews.

- [#17](https://github.com/crosshatch/traits/pull/17)
  [`e331b3a`](https://github.com/crosshatch/traits/commit/e331b3abe41eb3bf6077f6f3d0b7cace2dc34290) -
  Remove the init command in favor of agent-guided setup. The setup prompt
  points to a canonical guide covering consumer-specific package-manager
  configuration, provider selection, agent-specific skill placement, and MCP
  connection.

## 0.5.0

### Minor Changes

- [#11](https://github.com/crosshatch/traits/pull/11)
  [`3af6084`](https://github.com/crosshatch/traits/commit/3af60845210600bc9ea31c7d9a40b6305c4c84f7) -
  Initial release of the Traits MCP server, SDK, and init CLI.

### Patch Changes

- [#13](https://github.com/crosshatch/traits/pull/13)
  [`3516acd`](https://github.com/crosshatch/traits/commit/3516acdec2be9be9d0cccd8cd53c976fc90abc1d) -
  Exclude Git-ignored files by default, refreshing ignore rules on each check.
  Untracked files do not need to be added to Git to be evaluated.
  Already-tracked files remain eligible even if ignore rules match them. Set
  excludeGitignored: false to opt out.

- [#13](https://github.com/crosshatch/traits/pull/13)
  [`3516acd`](https://github.com/crosshatch/traits/commit/3516acdec2be9be9d0cccd8cd53c976fc90abc1d) -
  Keep init focused on creating configuration and print explicit skill
  installation instructions for native pnpm support and cross-agent installers.
  Stop copying a potentially stale skill snapshot automatically; existing files
  remain untouched.
