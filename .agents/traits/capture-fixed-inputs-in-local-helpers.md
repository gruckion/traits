---
name: capture-fixed-inputs-in-local-helpers
subject: Helpers used only within one enclosing operation. Applies to ordinary
  inputs, not Effect context services. Excludes helpers that only forward
  arguments into an error constructor; those should be inlined per
  inline-trivial-error-construction.
assertion: Prefer defining the helper locally and capturing fixed ordinary
  inputs rather than hoisting it and passing the same unchanged inputs at every
  call. Retain broader scope when reuse, a meaningful API boundary, or
  construction costs justify it.
purpose: Keep helper ownership clear and avoid redundant argument plumbing.
---
Out of scope: `const fail = (problem: string) => MyError.make({ path, problem })`. Error-constructor forwarding helpers are not endorsed by this trait; inline them instead.
