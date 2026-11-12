---
name: prefer-patch-changesets
subject: Changesets and release increment selection. Applies when authoring
  changesets or choosing a release increment. In Markdown files.
assertion: Prefer patch changesets by default. Use a minor changeset only when
  there is a compelling reason for a minor release.
purpose: Keep routine release increments conservative and reserve larger
  increments for justified changes.
---
```diff
 ---
-"traits": minor
+"traits": patch
 ---
```
