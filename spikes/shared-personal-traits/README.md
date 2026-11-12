# Shared personal Traits — throwaway spike

Question: can concurrent agents use one personal trait collection outside all
application repos, including newly created worktrees, without installing files
in those checkouts?

**Verdict: the core arrangement works over shared HTTP MCP. No worktree-aware
bridge is needed when callers supply absolute file paths.** This is a fixture
experiment, not an installed integration or a production-ready service.

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

`server.mjs` composes the existing Traits toolkit, store, derivation approval
logic, database and exclusive server lock with Effect's Streamable HTTP MCP
transport. It does not remove or bypass the store ownership lock: there is only
one owner. All new behavior is isolated in this spike; upstream source,
manifests and lockfiles are unchanged.

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

## What this does not establish

- Model quality, paid provider/API compatibility, or language generation:
  classification is deterministic fixture output; generation fails explicitly.
- Real Codex/Claude Code/T3 connections, skill discovery or their native
  elicitation forms. Only protocol clients and fallback approval were exercised.
- An authenticated, persistent personal service, restart/recovery, approval
  session isolation, or protection against hostile clients/TOCTOU file changes.
- Full sensitive-file or generated/dependency exclusion coverage. The narrow
  fixture guard is not a general file admission policy.
- A packaged CLI/config interface or automatic agent setup.

The server binds to a random localhost port and operates only on disposable
fixture data. Do not point it at real application work until those gaps are
addressed. Next step: select providers/models, turn this into an explicit
personal-home/HTTP mode, then verify actual clients and lifecycle behavior.

## Primary references

- [Traits setup](https://traits.sh/SETUP.md)
- [Upstream file selection and absolute paths](https://github.com/crosshatch/traits/blob/main/traits/toolkit/CheckTraits.ts)
- [Upstream Git file-set filter](https://github.com/crosshatch/traits/blob/main/traits/getIncludedFiles.ts)
- [Upstream exclusive ownership](https://github.com/crosshatch/traits/blob/main/traits/TraitProjectLock.ts)
- [Upstream derivation and approval](https://github.com/crosshatch/traits/blob/main/traits/TraitDerivation.ts)
