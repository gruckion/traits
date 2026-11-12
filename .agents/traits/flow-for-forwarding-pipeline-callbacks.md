---
name: flow-for-forwarding-pipeline-callbacks
subject: Callbacks and functions that only forward input through
  transformations. In TypeScript or TSX files.
assertion: Use flow to compose callbacks and function definitions that only
  forward their input through successive transformations, whether expressed as a
  pipe or as an intermediate variable followed by a return. For example, use
  flow(parse, build) rather than (input) => { const value = parse(input); return
  build(value) }. A stage may return a closure over its transformed input, such
  as flow(traitIgnores, (references) => Array.filter((trait) =>
  !references.has(trait.name))). Keep a callback when it needs additional logic
  or argument handling that flow would not preserve.
purpose: Make pure forwarding composition explicit without unnecessary
  parameters and callback scaffolding.
---
```diff
-const process = (input) => pipe(input, parse, build)
+const process = flow(parse, build)
```

Not forwarding: a function that uses its input again after the first stage, or that builds a new value from several arguments, such as `(input) => pipe(read(input), String.slice(input.range.start, input.range.end))` or `(change, segment) => pipe({ change, segment }, decode)`.
