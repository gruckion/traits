---
name: react-state-and-actions-as-atoms
subject: React component state, event handlers, and asynchronous actions. In TSX files.
assertion: In React code, use Effect reactivity atoms instead of useState and
  component-local state/action functions. Define state and action atoms outside
  component render functions, read state with useAtomValue, and obtain event
  handlers with useAtomSet. Implement asynchronous actions with Atom.fn and use
  its context to read/write related state atoms; do not manually fork Effects
  from component handlers. Preserve appropriate per-instance state isolation and
  lifecycle cleanup.
purpose: Keep React state and actions composable under Effect reactivity with
  explicit ownership and lifecycle management.
---
```diff
-const [count, setCount] = useState(0)
+// Module scope:
+const countAtom = Atom.make(0)
+// Component:
+const count = useAtomValue(countAtom)
+const setCount = useAtomSet(countAtom)
```
