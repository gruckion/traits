---
name: structural-equality-for-composite-keys
subject: Composite keys in Effect collections, caches, and Atom.family. Applies
  when composite keys in Effect collections, caches, or Atom.family need
  content-based equality. In TypeScript or TSX files.
assertion: When a composite value is used as a key in an Effect collection,
  cache, or Atom.family and should match by its contents across independently
  created instances, use Effect-compatible structural equality and hashing, such
  as Data.Class, rather than plain object identity or hand-written
  comparison/stringification. For example, new CopyInput({ id, code }) should
  reuse the same family atom for equal id/code values. Keep primitive keys or
  intentional identity semantics when appropriate; do not wrap ordinary objects
  merely because they contain data.
purpose: Ensure logically equal composite inputs share collection entries or
  cached state across independently created instances.
---
```diff
-const key = { id, code } // Fresh object identity on every call.
+class CopyInput extends Data.Class<{ readonly id: string; readonly code: string }> {}
+const key = new CopyInput({ id, code })
```
