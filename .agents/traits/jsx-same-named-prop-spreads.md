---
name: jsx-same-named-prop-spreads
subject: Ordinary React JSX props receiving same-named variables. In TSX or JSX files.
assertion: "In React JSX, prefer object-spread shorthand for ordinary props
  whose values are same-named variables: {...{ step, index }} instead of
  step={step} index={index}. Keep React’s special key prop explicit, and use
  explicit assignments for renamed or computed values."
purpose: Reduce repetitive JSX prop forwarding while keeping special and
  computed props explicit.
---
```diff
-<Step key={id} step={step} index={index} />
+<Step key={id} {...{ step, index }} />
```
