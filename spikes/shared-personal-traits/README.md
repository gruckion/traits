# Shared personal Traits — throwaway spike

Question: can concurrent agents use one personal trait collection outside all
application repos, including newly created worktrees, without installing files
in those checkouts?

**Verdict: the core arrangement works over shared HTTP MCP. No worktree-aware
bridge is needed when callers supply absolute file paths.** This is a fixture
experiment. A separate private personal pilot is now installed for Solea; it is
not a supported team deployment.

The pilot runs outside application repos, starts at login, and requires bearer
authentication on loopback HTTP. Actual Codex CLI, Claude Code CLI, and T3
Claude sessions each successfully called `check_traits`; T3 also discovered the
shared skill. The personal collection remains empty, so these checks prove
connections, not code compliance.

The default run uses fixture models. A separate opt-in provider probe now
verifies direct Jev and subscription-authenticated Codex generation.

## Run

From the fork root, using its pinned pnpm version:

```sh
pnpm install --frozen-lockfile
node spikes/shared-personal-traits/run.mjs
```

The experiment creates disposable Git repositories and real linked worktrees,
starts a loopback-only HTTP MCP server, runs three independent protocol clients,
and cleans up its children and scratch files. Results are written to
`results.json`. No Solea code, agent settings, provider keys, or real
preferences are read or modified. The labels on the clients identify fixture
roles; they are not the real Codex, Claude Code, or T3 applications.

## What was exercised

1. Baseline upstream lock: a second server cannot own the same trait directory.
2. Three clients connect concurrently to one HTTP MCP server and discover both
   upstream tools.
3. Concurrent checks of a checkout, a linked worktree, and an independent repo
   return each file's actual modified contents and SHA-256 revision.
4. A new worktree created after startup works without Traits setup files.
5. Each selected file's own Git checkout controls ignored/untracked behavior;
   tracked-but-ignored files stay eligible.
6. Files outside the allowed folder, symlinks escaping it, `.env` files,
   ambiguous relative paths, and paths containing glob syntax are rejected.
7. A proposed fixture trait is absent until approval; after saving, another
   client's check sees the same new trait.
8. Competing proposals with the same name and different requirements do not let
   one client's approval save the other's wording.
9. All fixture application checkouts remain free of Traits files/dependencies.
10. Missing or incorrect bearer tokens are rejected before MCP initialization.

`server.mjs` composes the existing Traits toolkit, store, derivation approval
logic, database and exclusive server lock with Effect's Streamable HTTP MCP
transport. It does not remove or bypass the store ownership lock: there is only
one owner. New runtime behavior is isolated in this spike; upstream source is
unchanged. The root development manifest/catalog/lockfile add the direct
TypeSafe provider at 4.1.2, matching existing Effect 4.1.2 without upgrading it.

The shared server's working directory cannot serve as the Git root for every
client. For the experiment, a middleware guard validates exact absolute paths
and checks Git's file set in each file's actual checkout before dispatching the
upstream check tool. The upstream single-checkout Git filter is disabled only
inside this fixture server and replaced by that guard. Native globs and
directories are deliberately unsupported; paths containing glob metacharacters
are rejected, even when they name existing literal files. This prevents a
validated literal filename from selecting a different file during upstream glob
expansion. Files are supplied explicitly, so no automatic repository audit
occurs.

## Direct providers and subscription generation

```sh
MONDASH_ENV_FILE=/absolute/path/to/mondash/.env \
  node spikes/shared-personal-traits/probe-direct.mjs
node spikes/shared-personal-traits/probe-codex-guards.mjs
```

The opt-in live probe reads `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` from the
explicit local file. It does not copy, print or commit the key or load the other
environment values into the process. It uses the direct TypeSafe provider, not
OpenRouter. The successful live probe selected `jev-latest` and then generated a
schema-validated Traits object through `gpt-6.1-sol`. `direct-results.json`
contains only non-secret verification summaries.

The generation adapter invokes `codex exec` with the existing ChatGPT login,
rejects API-key login and omits API-key/access-token variables from its child
environment. Codex manages its own authentication; no OAuth tokens are
extracted. Each invocation is ephemeral, uses a temporary working directory,
ignores user config/rules, disables shell/apps/plugins/web search, and rejects
responses that report tool execution. It uses a strict output schema and
restores omitted optional fields before Effect validates the result. This is a
narrow, non-streaming text/structured-output adapter, not a complete Codex SDK.

The offline guard probe exercises API-key login rejection before generation,
child credential isolation, optional-field restoration and required-null
preservation with a fake CLI. The live probe separately exercises real provider
authentication and generation. Live probes consume Jev API usage and Codex
subscription allowance; they are not part of the default fixture run.

Cancellation and input-pipe failure are checked against a deliberately
SIGTERM-resistant fake CLI. The adapter waits for process closure and escalates
to SIGKILL before ending a cancelled/failed call, then removes its temporary
directory. The cancellation regression reproduced a surviving child before the
fix. Schema normalization is limited to the tested Traits object/array/optional
field shapes; this is not a general JSON Schema adapter.

A separate live protocol smoke check also connected two concurrent sessions to
the shared HTTP host in direct mode and verified real Jev findings for separate
checkout/worktree files. Actual agent setup was subsequently verified separately
as described above.

`SPIKE_PROVIDER_MODE=direct` selects these layers in the experimental HTTP host;
it additionally requires `MONDASH_ENV_FILE`, `SPIKE_TRAITS_HOME`,
`SPIKE_WORK_FOLDER`, and a private `TRAITS_MCP_TOKEN_FILE` containing at least
32 characters. `TRAITS_MCP_PORT` selects a stable port; zero selects an
ephemeral port. The same single-owner host serves the personal pilot.

References:
[Codex non-interactive authentication and output schemas](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex subscription sign-in](https://learn.chatgpt.com/docs/auth?surface=cli),
[TypeSafe System One API](https://docs.typesafe.ai/api/system-one.md).

## What this does not establish

- Model quality or real-provider conflict reconciliation: the default run is
  deterministic, while the separate live probe covers a simple decision and
  structured trait generation only.
- Native approval forms in every real app. Actual connections and skill
  discovery were verified separately; approval behavior remains fixture-tested
  until a real preference is proposed and approved.
- Complete restart/recovery, approval session isolation, or protection against
  hostile clients/TOCTOU file changes. The personal pilot uses authentication
  and launchd supervision, not a multi-user service deployment.
- Full sensitive-file or generated/dependency exclusion coverage. The narrow
  fixture guard is not a general file admission policy.
- A packaged CLI/config interface or automatic agent setup.

The default experiment uses a random localhost port and disposable fixture data.
The separate personal pilot uses a stable loopback endpoint and external
personal storage. Direct Jev and Codex subscription access are the selected
provider route. Continue validating through small, approved preferences before
considering team use.

## Primary references

- [Traits setup](https://traits.sh/SETUP.md)
- [Upstream file selection and absolute paths](https://github.com/crosshatch/traits/blob/main/traits/toolkit/CheckTraits.ts)
- [Upstream Git file-set filter](https://github.com/crosshatch/traits/blob/main/traits/getIncludedFiles.ts)
- [Upstream exclusive ownership](https://github.com/crosshatch/traits/blob/main/traits/TraitProjectLock.ts)
- [Upstream derivation and approval](https://github.com/crosshatch/traits/blob/main/traits/TraitDerivation.ts)
