# Trait evaluation lifecycle

## Runtime API

`check({ traits, changes })` evaluates caller-ordered traits and changes and
returns a `Report`. Each trait entry is `{ trait, origin? }`, so a trait's
origin travels with it; each change entry is `{ change, ignores? }`, where
`ignores` maps names of traits that exclude the change to reasons, so an ignore
directive travels with the file it appears in. It requires `SegmenterRegistry`,
`EnrichmentRegistry`, `Digest` for report text digests, and a `DecisionModel`
when assertions are assessed. Guidance-only traits do not call the decision
model. The request is decoded first: duplicate trait names, two changes sharing
an after path, or ignores naming unknown traits fail with a `SchemaError` before
any extension or model work. Success of the Effect means report assembly
finished, not that its assessments satisfy a caller's acceptance policy; use
`Report.verdicts` with a `DecisionPolicy` for that interpretation.

Subject identification is also available independently as
`TraitSubject.match(subjects, input)`, where subjects is a caller-keyed record.
It submits one named `yes/no/uncertain` classification per subject over shared
source context in one `DecisionModel.decideSettled` request. Its response
retains keyed outcomes, request usage, and provider metadata. Each outcome is a
validated answer (including probabilities) or an `Unanswered` result; missing,
refused, or invalid answers do not discard valid siblings. Request-wide failures
remain in the Effect error channel. An empty record makes no provider request
and reports zero token usage. Single-subject requests use the same API, for
example `TraitSubject.match({ subject }, input)`. Matching neither evaluates an
assertion nor applies a gating policy. Callers choose appropriately sized
subject groups for the selected provider; this API does not batch unrelated
inputs or impose an unmeasured numeric batch limit.

`TraitAssertion.evaluate(assertions, input)` similarly batches caller-keyed
`TraitAssertionInput` values over shared source context with `decideSettled`.
Each request carries its assertion, static context (subject, purpose, body), and
its own successful enrichments. The model must not mix context across entries.
The four existing `pass`, `fail`, `na`, and `uncertain` classifications remain
unchanged. Responses preserve keyed outcomes, usage, and metadata; empty batches
make no provider request. `Trait.ts` defines the static trait schema, not the
evaluation operation.

Decision requests carry a compact `DecisionState` rather than the raw input: the
target text once, the complete file version only when the target is part of it,
and the earlier version with its mapped ranges only when the segmenter supplied
that correspondence. Unmapped earlier text is omitted rather than sent with an
instruction to ignore it.

`check` gates each input of a trait with a subject on `TraitSubject.decide`
before any other work on that input. `decide` issues an Effect request that a
grouped resolver batches by input: concurrent subject decisions on the same
input, typically one per trait, share one `TraitSubject.match` request of up to
32 keyed questions, collected over a 10 ms real-time window. The file is
therefore sent once per batch instead of once per trait, and run usage counts
each shared response once. The resolver is the seam for later request-level
optimizations, such as caching unchanged decisions or routing decision kinds to
different models, without changing `check`. When the decision model labels the
target `no`, the input is reported as `Unmatched` with the subject
probabilities, and neither its enrichments nor its assertion run; verdicts treat
it as Pass. Otherwise, including an `uncertain` label, so possibly in-scope code
is still assessed, the input proceeds and records the probabilities as
`subject`. The gate uses the model's label rather than a threshold.
`Models.layerDecisionLimit` caps simultaneous decision requests at the
configured concurrency and retries transient provider failures (rate limits,
network and internal provider errors) up to five times with jittered exponential
backoff, waiting at least as long as a rate limit asks. A retrying request keeps
its slot, so throttling slows the whole check instead of failing queued work. A
failed or unanswered subject decision fails the input with an explanation and
records its enrichments as `Cancelled`; explanations name the failure reason,
such as `RateLimitError after retries`, `AuthenticationError (InvalidKey)`, or
`unanswered (Invalid)`, but never provider text, defects, or source; trait
recovery can cancel the decision like an assessment. Traits without a subject
are not gated. Subject decision usage and model identities count toward the
run's provenance.

After the gate, `check` delegates each ready trait/input assessment to the
assertion collection API, converting an unanswered outcome to an
assessment-execution failure; a trait without an assertion completes with its
static context and enrichments. It does not yet coalesce work across traits;
their existing recovery and cancellation boundaries are unchanged.

An enrichment setup failure is reported once and disables that enrichment for
the check. Assessment still proceeds with remaining context unless an
input-scoped or trait-scoped execution recovery signal prevents it. There is no
required-enrichment policy flag in this API.

Build `SegmenterRegistry.layer` and `EnrichmentRegistry.layer` once in the
host's scoped runtime and reuse them across checks. They can be composed with
`Layer.mergeAll`. The host provides the services listed in
`ExtensionServices.HostServices`; registries capture exactly those from the host
context, so no other host service, such as the host's own `Scope`, reaches an
extension. `ExtensionServices` is `HostServices` plus the chat and scope the
registry creates for each execution. Keep the same model/account bindings for
the lifetime of those registries. Each registry owns its own typed cache; the
internal `ExtensionRegistry.make` shares cache lifecycle, setup-scope ownership,
service capture, and fresh execution contexts without a kind discriminator. It
accepts setup-result, setup-error, and execution-error schemas;
`ExtensionModule.load` owns importing, module/result validation, and rejection
of undeclared setup errors. The shared execution transformer preserves declared
execution errors and turns unexpected failures into defects. Each typed registry
still owns its execution contract. Module-shape and setup-result validation
failures remain typed `SchemaError`s alongside the declared setup error.
Registry service types are inferred from their `make` effects, with host
services provided internally. Registries also require `WorkspaceRoot`, the
canonical workspace directory built with `WorkspaceRoot.layer(directory)`, and
import each module from that root.

Extension references must already be resolved. Hosts resolve script paths and
package references with `ExtensionModule.resolve({ reference, baseUrl })` from
`ExtensionModule.ts` before constructing static traits. `baseUrl` is the trait
file URL, or an explicit host-module URL in the intended workspace for
programmatic definitions. ESM package resolution uses that base and its import
conditions, never the traits installation or an implicit working directory. The
resolved URL must be a file URL, and the canonical module file must lie within
`WorkspaceRoot`. Queries and fragments are dropped: identity is the file's path
and registries import by that path, so they cannot create duplicate module
instances. An extension's identity is that file's `WorkspacePath`, the same
schema used for change paths, such as
`node_modules/@traits/typescript/segmenter/index.js`. Modules outside the
workspace fail with `ModuleResolutionError`. Relative identities keep traits,
diagnostics, enrichment reports, and model requests free of host-specific
absolute paths, so checks of the same workspace on different machines produce
comparable reports. The schema validates path syntax only; it cannot tell an
unresolved package name from a directory with the same name, and it does not
prove resolution, so hosts must obtain extension paths through `resolve`.
Trait-file loading, CLI profile-to-runtime wiring, and explicit in-place
registry reset remain separate work.

Checker phases return their data rather than preallocating mutable observations.
`Check/Preparation.ts` collects unique extension references and returns setup
diagnostics, a read-only map of initialized enrichments by module, and read-only
maps of validated input-selection `Result`s. Successful segmenter setup
functions are discarded once segmentation finishes. Registry layers still own
setup caching. `Check/Evaluation.ts` builds each trait's `ChangeReport` directly
from the request and preparation: `Ignored` when the change names the trait,
`NotSegmented` when its segmentation failed, and otherwise `Evaluated` inputs.
It also totals run usage and models from the responses it received. The
enrichment registry validates extension output; typed error handlers use the
existing `EnrichmentError.reason` to coordinate recovery, then record a safe
explanation on the enrichment outcome. Recovery cancellation records a
`Cancelled` outcome without context or explanation, and without constructing
interrupted exits. Caller interruption still exits through Effect. Trait/input
`Deferred`s coordinate recovery, not report storage. Evaluation returns the
report's own `TraitReport`, `ChangeReport`, and `InputReport` shapes; no
parallel result hierarchy or conversion layer is needed.

Cancellation uses normal Effect fiber interruption: pending work is interrupted
and execution cleanup completes, without returning a partial report. Callers do
not provide an `AbortSignal`. Cancellation does not invent failure diagnostics.

```text
Static traits + provided inputs
  → initialize extensions
  → segment each change
  → enrich each trait/source location
  → assess assertions
  → return reports and recovery instructions
```

## Check a workspace

A workspace keeps its configuration and traits under `.agents/traits/`:

- `.agents/traits/_traits.json` is plain JSON, so it loads without executing
  code or installing JavaScript dependencies. It records the traits `version`
  the workspace was last migrated to, optional `extends`, the `models` for the
  language and decision roles, and an optional `concurrency`: the maximum number
  of simultaneous decision requests, 16 by default. It lists no traits, and
  unknown keys are rejected, so a trait list from an earlier version is reported
  rather than ignored. Credentials come from the environment, falling back to
  the workspace's `.env` and then to the main checkout's `.env`, so linked Git
  worktrees share its credentials (`WorkspaceConfigProvider`).
  `TraitsConfig.load` fails with an agent-facing message when the file is
  missing, invalid, or written for an incompatible version under caret
  semantics.
- `.agents/traits/<name>.md` defines each trait: YAML frontmatter with `name`,
  `purpose`, and optional `subject`, `assertion`, `segment`, and `enrichments`,
  and a Markdown body of supporting context. Unknown frontmatter keys are
  rejected, so outdated files are reported rather than misread. Extension
  references resolve relative to the trait file. Every `.md` file in the
  directory is a trait, and its file name must be its kebab-case trait name.
- `.agents/traits/_environments/<name>.json` defines an optional environment,
  `{ "traits": [...] }`, naming a subset of the workspace's traits to check,
  such as a smaller set for CI. Unknown keys are rejected, and `extends` is not
  supported yet.

`WorkspaceCheck.run(config, { paths, environment?, traits? })` checks files
against the selected traits. `WorkspaceTraits.select` checks every trait by
default, narrows to an environment's traits when one is given, and then to the
requested trait names. Names without trait files, requested traits outside the
environment, and unknown or invalid environments fail with a message saying what
to fix. Each path becomes a change pairing the working-tree text (after) with
the text at Git `HEAD` (before): untracked files are new, deleted tracked files
are deletions, and workspaces outside Git have no before text. Paths may be
workspace-relative or absolute within the workspace. Each trait's report records
its file as `origin`. `extends` is not supported yet and fails the check rather
than silently checking fewer traits.

The `WorkspaceCheck` service owns the complete pipeline, independent of any
front end: `check(request)` loads `.agents/traits/_traits.json` and the trait
files, builds the configured models and fresh extension registries, and returns
the full report. `WorkspaceCheck.layer` supplies default host services (HTTP,
WebCrypto digests and randomness, an in-memory key-value store, and the local
time zone); the host provides the platform and `WorkspaceRoot`. The
`traits check` CLI command prints the report as JSON, and the `traits.check` MCP
tool returns it, turning any failure into its message so the agent can act, for
example by running `traits update`. Both use the current directory as the
workspace.

`traits check` writes only the report to stdout; verdicts and errors go to
stderr. Without a policy it exits 0 whenever the check runs, because the report
implies no thresholds. With `--fail` and `--pass` (and optionally `--na`) it
derives the verdict with `Report.verdicts` and exits 0 for Pass, 1 for Fail, 2
for Incomplete, and 3 for Inconclusive. A check that cannot run, such as one
with missing configuration or a partial policy, also exits 2, since the fix is
to repair the setup and retry. Invalid command-line usage exits 1, as Effect's
CLI does.

`traits update` prints the context an agent needs to migrate a workspace to the
latest release: the workspace, installed, and latest versions and each
intermediate release's changelog, oldest first. The agent performs the
migration.

## Provide traits and inputs

A `Trait` is a static definition: its name, purpose, optional subject, assertion
and supporting body, optional segmenter module, and optional enrichment modules.
Enrichment never rewrites the trait or its body.

Lifecycle changes and evaluation sources are separate representations:

- `Change` contains `before` and/or `after` sources, with at least one required
  in both the schema and inferred type. After-only means creation, before-only
  means deletion, and both means update. Each source has its own path,
  preserving renames without a separate path field.
- `InputSource` identifies one selected version by its path and complete decoded
  `text`. Only text inputs are supported; binary files must be excluded or
  explicitly rejected at the input boundary, not silently decoded as text.
- Paths are `WorkspacePath`s: normalized workspace-relative POSIX paths without
  empty, `.`, or `..` segments, backslashes, leading slashes, or drive letters.
  No two changes in a check may share an after path. Before paths may repeat,
  because a copy and an update can both originate from the same file.

The caller supplies a change. Segmenters can inspect both available versions and
select assessment targets from either side. This does not require full semantic
analysis of both versions or a historical compiler project.

## Initialize extensions

Each trait may reference a segmenter and enrichments. These extensions are
initialized before use, separating reusable setup from the work performed for
each input or location.

Initialization is shared across the entire program lifecycle, not repeated per
trait or evaluation. A program-level registry identifies an extension by its
kind (segmenter or enrichment) and resolved module identity. Module references
must be resolved by the host before constructing static trait definitions;
schema construction does not perform resolution. For example, resolve
`@traits/typescript/segmenter` with a parent URL for the trait file and pass the
returned workspace-relative path as `segment` to `Trait.make`. The resolver
canonicalizes existing file paths (including symlinks) against the canonical
workspace root; equivalent references share one registry entry and report module
reference, including references differing only by a query or fragment.
Concurrent callers await the same initialization outcome. Setup resources live
until program shutdown or an explicit reset; each distinct execution owns its
resources. Shared setup state must support concurrent executions across traits
and evaluations.

A failed initialization remains failed until explicit reset or program restart;
starting another evaluation does not retry it. Reset must coordinate dependent
executions before replacing setup resources. Registry, resolution, and reset
implementation remain separate from these lifecycle contracts. The implemented
registry retains setup fibers and their outcomes until its host scope closes;
one interrupted waiter does not interrupt initialization shared by other checks.
Creating a new registry after shutting down the owning runtime starts a new
setup lifecycle. An in-place reset API is not implemented.

Enrichment module references must be distinct within a trait, so each module
unambiguously identifies its configured enrichment in results and failures.

## Select ranges within a change

When a trait has no segmenter, the evaluator uses the entire after-source, or
the entire before-source for a whole-file deletion, as one input. No parser or
segmentation extension runs. Internally this is represented by a full-file
`After` or `Before` range, including `{ start: 0, end: 0 }` for an empty file.
Default whole-file selection does not compute historical correspondence, so
`After.before` is omitted.

Within one evaluation, the runner segments each caller-supplied change once per
resolved segmenter module, sharing the validated result or failure across all
traits using that module. Concurrent consumers share the same invocation; an
observed execution failure is recorded once for its module and change. This
execution-sharing contract is separate from program-lifetime initialization and
does not cache results across evaluations. Each shared invocation owns its own
execution resources. The evaluator implements this with invocation-local
segmenter results, validating each complete result before allocating downstream
inputs.

Segmentation is intentionally trait-independent in this version. A segmenter
receives no trait subject, assertion, or per-trait options; traits using the
same resolved module receive the same segments for a change. Different selection
behavior requires different segmenter modules, which may reuse implementation
internally. Trait-specific enrichment and assessment remain separate downstream
work.

Trait independence enables sharing segmentation results; it is not required to
share initialization. If per-trait execution options are introduced later,
execution identity must include every option that affects segmentation rather
than sharing by module and change alone. Setup identity would need to change
only if those options also affect initialization. Per-trait options and their
identity semantics remain deferred.

Segmenter initialization returns an execution function that takes a `Change`
directly and produces an array of `Segment` values:

- `Before`: a primary `range` in the before-source, including deleted material.
- `After`: a primary `range` in the after-source, plus optional `before` ranges
  providing mapped historical context.

An omitted `After.before` means correspondence has not been computed; an empty
array means it was computed and found no counterpart. Nonempty historical ranges
require a before-source. Each segment produces one assessment input; historical
context ranges are not additional independent assessment targets.

Each range selects decoded text using zero-based UTF-16 offsets, with an
inclusive start and exclusive end. The complete source is represented by
`{ start: 0, end: source.text.length }`, including `{ start: 0, end: 0 }` for
empty text.

A range must have nonnegative integer offsets, must not end before its start,
and must fit within its source text. Neither boundary may split a UTF-16
surrogate pair. This does not require grapheme-cluster boundaries.

`Input` is a top-level `Before | After` tagged union pairing a `segment` with
the `change` it selects from. Each case reuses `ChangeWithBefore` or
`ChangeWithAfter` from `Change.ts` and the matching case of `Segment`, so the
selected source is present in both the runtime schema and the static type; the
input's tag always equals its segment's. `fromSegment` validates construction,
and reports store `input.segment` directly. Each case's schema checks primary
and historical range bounds and surrogate-pair boundaries against their
respective source texts. Before and after offsets are independent: mapped
correspondence must be established through diff analysis, not numeric overlap.
Bounds validation alone does not establish correspondence. Simple segmenters may
omit mappings; change-aware implementations may supply them.

Mappings are supplied by the segmenter. The runner does not promise to compute
missing mappings.

Enrichment context uses this representation. Serialized input reports preserve
the complete segment, without source contents, inside the trait's result for the
caller's change.

An empty result successfully selects no targets for the change. The trait
reports the change as `Evaluated` with no inputs, and no enrichment,
assessments, or diagnostics. This outcome may produce a `Pass` verdict when no
other failure occurred. Failures and defects must not be converted into empty
successful results.

Segmentation must succeed and cannot request recovery-based skips. Before
scheduling any enrichments for a change, the runner validates the entire custom
result: every segment combined with that change must validate as an `Input`. A
malformed segment, unavailable selected side, or out-of-bounds primary or
historical range rejects the entire result for that change; valid fragments are
not scheduled separately. This validation checks bounds, not diff
correspondence.

Initialization or execution failures and defects prevent dependent enrichment
and assessment. Initialization failure blocks all changes using that segmenter;
execution failure or invalid output blocks the current change for every trait
sharing that invocation. Other segmenters and unaffected changes may continue.
No replacement segments or synthetic input reports are created; each affected
trait reports the change as `NotSegmented`. The shared setup or execution
diagnostic records the failure once; invalid output produces a diagnostic
describing the validation failure. These make the affected changes, traits, and
the report `Incomplete` unless a violation was found.

No fallback preserves the configured segmenter's selection semantics. Generic
text chunks may not represent its intended targets and can produce misleading
assessments, duplicated context, and unnecessary model calls. We accept reduced
coverage after segmentation failure, including potentially deleted material,
rather than silently substitute another selection strategy. For example, a
syntax error blocks dependent traits for a change only if their segmenter cannot
handle it and fails. Diagnostics expose that failure, recovery instructions make
known remediation actionable, and unaffected work may continue. An empty result
therefore means successful selection of no targets, never concealed failure.

Segmenter error channels are stage-specific. `SegmenterSetupError` provides
required recovery instructions for initialization, and `SegmenterError` provides
them for execution. The runner recognizes each only at its matching stage and
reports `Diagnostic.Instruction` with the corresponding segmenter origin.
Unexpected defects and contract-violating failures follow ordinary failure
normalization: `Error` unless the runner independently knows actionable
remediation. Instructions provide remediation only; they do not change execution
control flow.

## Enrich each trait and source location

For each location selected for evaluation, enrichment receives:

- `trait`: the unchanged static definition.
- `input`: an `Input` containing the shared `change` and the selected `segment`.
  Its tag determines the primary side; an `After` segment's `before` provides
  optional historical context. Both complete source versions remain available
  when present.

For an `After` segment, enrichments access mapped historical ranges through
`input.segment.before` and resolve their text against
`input.change.before.text`. These ranges may represent multiple historical
regions and need not correspond to separately emitted `Before` segments. Mapping
availability is optional: enrichments must not interpret an omitted mapping as
evidence that no previous content exists. Before-only segments remain available
for independently assessing deleted material.

The enrichment returns a string of context for that evaluation. An empty string
is a valid completed result. The source remains available in full even when the
evaluated location is only a range.

Traits run in parallel, and enrichments for a trait run in parallel. Enrichment
context supplements the static trait definition; it does not replace or modify
it. Assessment proceeds after the relevant enrichments finish, unless recovery
has prevented that assessment.

## Assess the assertion

When a trait has an assertion, assessment receives the static trait definition,
the complete validated `Input`, and completed enrichment context. The input
preserves both available source versions, the primary segment, and any
historical mappings, including the distinction between omitted and empty
mappings. This context remains available even when no enrichments are configured
or no enrichment context is produced, provided recovery has not prevented
assessment.

The segment's primary side and range identify the assessment target; the
surrounding change and historical mappings provide evidence, not additional
assessment targets. Enrichments supplement that evidence rather than being
responsible for preserving before/after context. The decision model provides the
probabilities retained directly as `Assessment` fields:

| Outcome     | Meaning                                       |
| ----------- | --------------------------------------------- |
| `pass`      | The assertion holds.                          |
| `fail`      | The assertion does not hold.                  |
| `na`        | The trait does not apply.                     |
| `uncertain` | Available evidence is insufficient to decide. |

Individual probabilities must be finite numbers between zero and one. Their
normalization is trusted to the decision model, not revalidated by the report
schema. These probabilities express relative certainty across outcomes;
`uncertain` explicitly indicates insufficient evidence to decide.

Guidance-only traits have no assertion and therefore no assertion assessment.

Each input report is tagged by execution state, independent of assertion
acceptance:

- `Unmatched`: the subject decision ruled the target out. It carries the subject
  probabilities, but no enrichments, assessment, or explanation.
- `Completed`: required work finished. Assertion inputs have an assessment;
  guidance-only inputs do not. Inputs of traits with a subject carry its
  probabilities. A high `fail` probability is still a completed evaluation, not
  an execution failure.
- `Failed`: this input could not finish. Its `explanation` says why the subject
  decision or assessment failed; when an enrichment's `Input` or `Trait`
  recovery stopped it instead, that enrichment's `Failed` outcome explains it.
  It has no assessment.
- `Cancelled`: another input's trait-wide recovery stopped this input before
  completion. It has no assessment or explanation. Already completed inputs keep
  their state and assessment.

The tags make impossible combinations unrepresentable: only `Completed` carries
an assessment and only `Failed` carries an explanation. An enrichment-only
recovery can still allow a `Completed` input with an assessment; its `Failed`
enrichment outcome independently prevents that input from passing. Caller
interruption returns no report.

The report retains probabilities rather than the provider-selected label.
Consumers interpret them using explicit thresholds or decision policies; the
highest probability alone does not necessarily justify a definitive result.

## Handle failures and recovery

Extensions map expected underlying failures into their stage-specific API
errors: `SegmenterSetupError` or `EnrichmentSetupError` for initialization, and
`SegmenterError` or `EnrichmentError` for execution. These are the declared
error channels; extensions do not serialize underlying errors. Unexpected
failures may be explicitly promoted to defects, and thrown exceptions remain
defects. Narrowing the types alone does not convert failures into defects.
Required recovery guidance must be actionable rather than invented merely to
satisfy the type.

The runner still normalizes unexpected defects and contract violations from
untrusted extensions at the boundary. `EnrichmentError` execution signals
require nonblank recovery instructions. Their reason determines which remaining
work stops:

| Reason       | Effect                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `Enrichment` | Omit this enrichment's context; siblings may continue.                                               |
| `Input`      | Prevent assessment of this trait for the input and cancel its remaining enrichments.                 |
| `Trait`      | Cancel remaining work for this trait across inputs because a trait-wide prerequisite is unavailable. |

An initialization failure disables the enrichment. A recognized
`EnrichmentSetupError` carries recovery guidance, not a scope reason; other
setup defects or contract violations produce ordinary diagnostics. Whether
assessment requires that enrichment is a separate policy, not a decision encoded
by the setup error. After an `Enrichment`-scope skip, assessment proceeds with
the remaining available context unless another outcome prevents assessment, such
as `Input` or `Trait` cancellation. During execution, `Enrichment` affects only
its current invocation. Enrichments cannot cancel unrelated traits. There is no
whole-evaluation stop instruction in the report protocol.

Parallel failures are collected rather than reduced to one winning error.
Cancellation stops remaining work at the requested scope, but does not erase
successful results or failures already observed. A later trait-wide failure does
not invalidate assessments already completed. Cancelled work gets no invented
failure or recovery instruction.

Each failure is recorded once, where it happened, with an `Explanation`:
`Error { error }` for normalized failure details, or
`Instruction { instruction }` for actionable remediation including relevant
failure context. Both require nonblank text. The runner chooses `Instruction`
when remediation is known and `Error` otherwise. Recovery-control decisions
remain internal to the runner: recognized enrichment execution signals keep
their `Enrichment`, `Input`, or `Trait` reason on `EnrichmentError`, but reports
serialize only the explanation. Recognition remains stage-specific: an error
from the wrong stage is an ordinary failure, not a recovery control signal.

- **Shared failures** go in `Report.diagnostics`, because one failure affects
  many traits or inputs. Each `Diagnostic` pairs an `origin` with an
  explanation. Origins are `SegmenterSetup { module }`,
  `SegmenterExecution { module, change }`, and `EnrichmentSetup { module }`.
  Setup origins have no trait or input reference; a segmenter execution origin
  identifies the shared invocation by module and change index, without choosing
  an originating trait.
- **Local failures** are recorded on the affected input. An enrichment execution
  failure is the input's `Failed { module, explanation }` enrichment outcome. An
  assessment failure is the `explanation` on a `Failed` input. Model failures
  produce safe, bounded explanations rather than erasing completed results or
  being confused with a negative assertion assessment.

`Report.problems(report)` flattens both into one list of `Problem`s with their
trait, change, and input locations, for clients that list every problem. It is
derived, not stored.

Ordinary failures may also include actionable instructions; remediation text
never implies cancellation. Unexpected enrichment execution defects or contract
violations omit that invocation's context; they do not infer `Input` or `Trait`
cancellation. Siblings may continue and assessment proceeds with the remaining
available context unless another outcome prevents assessment. Interruption is
cancellation and never creates an explanation.

The runner must handle arbitrary thrown values, including cyclic objects and
ordinary errors, without relying on JSON serialization. It must exclude raw
error objects, source text, and excerpts from explanations and use a generic
failure message when useful details cannot be safely extracted. Unexpected
failure explanations must be bounded, readable text rather than serialized
arbitrary payloads. An explanation says what happened; it need not invent a
remedy. Setup failures do not fabricate inputs, and segmenter failures need no
synthetic assessment target.

Reports use deterministic ordering based on trait, source/location, and
configured module order, not the timing of concurrent completions. Scheduling
and cancellation are runner responsibilities; the schemas represent their
results.

## Assemble the report

Reports group results by trait, then by supplied change, then by selected input:

```text
Report
├── version: 1
├── run: Run
│   ├── evaluator: { name, version }
│   ├── models: string[] (distinct, sorted)
│   └── usage: { inputTokens?, outputTokens? }
├── changes: ChangeIdentity[] ({ before?, after?: { path, digest } }, at least one side)
├── diagnostics: Diagnostic[] (shared failures: { origin, explanation })
└── traits: TraitReport[] (unique trait names)
    ├── trait: Trait
    ├── origin?: TraitOrigin ({ path?, collection? }, at least one)
    └── changes: ChangeReport[] (aligned with Report.changes)
        ├── Ignored      { reason }
        ├── NotSegmented {}
        └── Evaluated    { inputs: InputReport[] }
            ├── Completed { segment, digest, enrichments, assessment? }
            ├── Failed    { segment, digest, enrichments, explanation? }
            └── Cancelled { segment, digest, enrichments }
                enrichments: EnrichmentOutcome[] (aligned with trait.enrichments)
                  Succeeded { module, text } | SetupFailed { module } | Failed { module, explanation } | Cancelled { module }
```

The report is the portable artifact shared by every host: agents, terminals, CI,
editors, code-scanning exports, and future caches. It contains only facts that
cannot be recomputed after the check. Views such as file-first grouping, compact
agent output, SARIF, or PR annotations are functions of a report plus, where
needed, the current sources; they are not alternative report schemas.

Structure carries the relationships instead of cross-referencing indices. Each
trait has exactly one `ChangeReport` per supplied change, so every trait/change
pair has an explicit outcome, and each input has exactly one `EnrichmentOutcome`
per configured enrichment. The remaining schema checks are mostly alignment:
trait results align with `Report.changes`, enrichment outcomes align with the
trait's enrichments, `NotSegmented` appears exactly when a segmenter diagnostic
explains it, `SetupFailed` appears exactly when the enrichment's setup
diagnostic exists, completed inputs carry an assessment exactly when the trait
has an assertion, and failed inputs are explained by an assessment failure or a
failed enrichment. The schemas cannot establish whether the runner assigned the
correct state in response to cancellation or recovery.

`version` identifies the report format; incompatible format changes increment
it. `run` records deterministic provenance without timestamps, hosts, or
absolute paths: the evaluator package name and version, distinct sorted model
identifiers reported by assessment responses, and token totals across received
responses. Each total is omitted when any response did not report it, rather
than understating usage. Responses lost to cancellation are not counted.

Required `Report.changes` records before and/or after source identities for
every supplied change in caller order. At least one side is required per change;
separate sides preserve renames. Each identity holds a workspace-relative path
and a `TextDigest`: `sha256:` followed by the lowercase hex SHA-256 of the
supplied decoded text encoded as UTF-8. Inputs preserve the complete `Segment`,
without source text or excerpts, including historical correspondence on `After`:
omission means unknown, while an empty array means no counterpart. The schema
validates that each input's selected source sides exist on its change. Full
sources remain available internally during execution. Each trait definition
appears once in its trait report. Generated enrichment text remains in the
report, but should not routinely echo the source.

Ranges describe the text supplied for evaluation, not necessarily the file's
current contents. Before mapping UTF-16 ranges onto a file, for example to line
and column positions, LSP diagnostics, or SARIF regions, a client decodes the
current file the same way, digests it, and compares the result with the reported
digest. A mismatch means the snapshot is stale and the file must be rechecked.
The digest covers decoded text, not raw bytes, so it is not a Git object ID.
Retrieving exact source versions still requires external provenance. Clients can
inspect retained supplied snapshots or retrieve matching versions from a known
Git baseline; arbitrary supplied text need not exist in Git. Reports do not
identify Git revisions or embed snapshots.

Inputs are ordered deterministically by source side and range, including work
that fails or is cancelled, not by completion timing. Range ordering and
nonnegative offsets are validated by the report schemas; range bounds and
surrogate boundaries against source text must be validated during execution
before reporting. The registry owns persistent setup outcomes; report assembly
includes each relevant setup failure once, and later evaluations may include the
same persistent setup failure again without implying another initialization
attempt. Trait, change, and input positions are report-local, not
program-lifetime identities.

Each input report also carries the `TextDigest` of its primary target text.
Positions and offsets are report-local, but the trait name, primary path, and
target digest together identify a target across reports even when unrelated
edits shift offsets. Baselines and suppressions use this identity. Identical
target texts in the same file share a digest, so consumers needing one identity
per occurrence must disambiguate, for example by occurrence order.

A trait report may also carry the `origin` supplied with the trait's `check`
entry: the workspace path of the trait's definition file, the extended
collection environment (`TraitsSource`) that supplied it, or both. Hosts omit it
when unknown, such as for programmatic definitions; the runner never infers it.

## Ignore changes per trait

A caller may exclude a change from a trait by naming the trait in that change's
`ignores` with a reason, for example from an ignore directive in the file. The
trait reports that change as `Ignored` with its reason and creates no inputs for
it. The reason is untrusted caller text, not an instruction. A change is
segmented only when at least one trait using that segmenter does not ignore it,
so a segmenter failure on an ignored file cannot block anything. Subject gating
has its own `Unmatched` input case rather than reusing `Ignored`, since it is a
model decision per input, not a caller exclusion per change.

## Enrichment outcomes

Each input records one `EnrichmentOutcome` per configured enrichment, in
configured order:

- `Succeeded { module, text }`: context supplied to assessment, including a
  valid empty string. These are exactly the contexts the model receives.
- `SetupFailed { module }`: the enrichment never initialized. Its shared
  `EnrichmentSetup` diagnostic explains why, once per report.
- `Failed { module, explanation }`: execution raised an error, a defect, or
  invalid output, including an `EnrichmentError` of any reason.
- `Cancelled { module }`: `Input` or `Trait` recovery stopped it before it
  finished, including before it started. Cancellation has no explanation.

Clients can therefore tell when an assessment ran with reduced context, and why,
directly from the input.

Completed results are preserved through input/trait recovery cancellation, so
the returned report contains completed work alongside the failures explaining
why other work did not finish. Caller interruption does not return a partial
report.

## Reevaluate after remediation

`Report.verdicts(report, policy)` derives a `Verdict` for every input, change,
trait, and the whole report. The result is aligned with `Report.traits`, their
changes, and their inputs, and is not stored in the report, so the stored
artifact remains policy-free. A `DecisionPolicy` is serializable data, so CI
configuration and hosted services apply the same thresholds:

- `fail`: the minimum fail probability rejecting an assessment, checked first.
- `pass`: the minimum pass probability accepting an assessment.
- `na`: an optional minimum not-applicable probability accepting an assessment.
  When omitted, not-applicable assessments never pass.

An assessment that neither fails nor passes is `Inconclusive`. An input whose
assessment fails is `Fail`. An `Unmatched` input is `Pass`. Otherwise `Failed`
and `Cancelled` inputs are `Incomplete`, as is a `Completed` input with any
enrichment outcome other than `Succeeded`, because it was assessed with reduced
context. Otherwise an input takes its assessment's verdict, and completed
guidance-only inputs are `Pass`. An `Evaluated` change combines its inputs, so a
change whose segmenter selected nothing passes; a `NotSegmented` change is
`Incomplete`; an `Ignored` change has no verdict. A trait combines its
non-ignored changes. The report combines its traits and is `Incomplete` whenever
any shared diagnostic exists. Verdicts combine by the precedence `Fail`,
`Incomplete`, `Inconclusive`, `Pass`, and an empty selection is `Pass`. `Fail`
takes precedence over `Incomplete`, so CI can distinguish "the code violates a
trait, so block" from "a check failed to run, so retry". Ignored changes do not
contribute. No probability threshold is implicit in the helper.

This relies on a complete runner-produced report. Structure guarantees that
every trait/change pair and every configured enrichment is represented; the
runner must still assign the correct states. A single trait-recovery `Failed`
enrichment may explain multiple cancelled inputs without duplicate explanations.
Caller cancellation uses Effect fiber interruption and returns no report; the
report has no interruption flag or top-level instruction. If no report is
returned, success cannot be inferred. The helper cannot detect omitted work from
the original request; zero scheduled inputs may legitimately pass when no work
was applicable and no failure occurred.

After the client follows recovery instructions, reevaluation starts from the
affected sources or changes, not their previous segments. Reload the relevant
inputs, rerun segmentation, and rerun all applicable trait checks, including
previously successful checks. Remediation can change both source contents and
segmentation boundaries.

Report-local positions and ranges describe one evaluation; they are not durable
retry identifiers. Incremental checking, dependency tracking, cache
invalidation, and persistent lock formats are deferred until the core execution
model is established. Reports already record the inputs a future lock entry
needs: source digests per change, the complete trait with workspace-relative
extension identities, and evaluator and model provenance. The client report
supplies results and remediation, not an execution ledger or retry schedule. A
passing assessment does not by itself establish successful execution; observed
extension failures remain relevant even when other work produces passing
assessments.

## Evaluate accuracy

`traits/eval/run.ts` measures trait-checking accuracy and cost with the
workspace's configured models. `traits/eval/cases.json` labels file snapshots in
`traits/eval/fixtures/` per trait as `fail`, `pass`, or `unmatched`; fixtures
include real files and variants with exactly one injected violation, and labels
for mechanical traits come from parsing the fixtures. The runner checks every
labeled trait against every fixture through the public `check` API, then reports
decision requests, tokens, time, subject-gate accuracy, and precision, recall,
false positives, and inconclusive verdicts under two policies, per trait. With
`--all-traits`, every workspace trait is checked so labeled traits share batches
with realistic neighbors, while only labeled traits are scored.
`--segment <module>` applies a segmenter to the labeled traits without editing
their files, and `--decision-model <model>` evaluates another OpenRouter
decision model, so segmentation and model choices are compared on the same
cases. Run it from the repository root before and after changes to prompts,
request shape, batching, segmentation, or models.
