---
name: traits
description: >-
  Use for work under ~/gruckion-workdir/solea when capturing reusable coding
  preferences, remembering corrections, reconciling traits, or reviewing changed
  source files. Covers the Solea monorepo, technician app, and worktrees there.
---

# Personal Solea Traits

Apply this skill only to work under `/Users/sigex/gruckion-workdir/solea`. Use
the connected `solea_traits` MCP server for `derive_trait` and `check_traits`.

Read [the bundled workflow](workflow.md) for capture, approval, review, and
failure handling. This personal installation adapts its project-local storage
and file-selection conventions as follows:

- All agents and worktrees share preferences in
  `/Users/sigex/gruckion-workdir/solea/.traits-personal/traits/`.
- Pass an explicit list of absolute authored-source file paths to
  `check_traits`. Directories, globs, and filenames containing glob syntax are
  unsupported.
- Each file's own Git checkout controls eligibility. Keep checks scoped to the
  current task. Empty traits or selections mean no assessment occurred.
- Store changes go through `derive_trait` and require approval of the exact
  proposal. Permission to edit code does not authorize saving a preference.
- Keep application checkouts free of Traits configuration, databases, and skill
  copies. Installation and credentials are managed in the outer personal folder.
- For connection trouble, inspect the local service using
  `/Users/sigex/gruckion-workdir/solea/.traits-personal/status.sh`.

Use the shared definitions consistently across clients. Report failed checks as
incomplete and retain pending proposals until approved, revised, or declined.
