---
name: minimal-test-grouping
subject: "Test-file organization and describe blocks. Applies when writing or
  organizing test files and describe blocks. In TypeScript, TSX, JavaScript, or
  JSX files. Exception: When every describe block under assessment organizes a
  meaningful behavior group rather than merely repeating the filename or
  subject."
assertion: "Keep test files minimally structured: write tests at the top level
  and omit outer describe blocks that merely repeat the filename or subject. Add
  named describe blocks only when they organize meaningful behavior groups."
purpose: Keep test navigation focused on meaningful behavior rather than
  redundant nesting.
---
```diff
-describe("parse", () => { it("preserves the body", testBody) })
+it("preserves the body", testBody)
```
