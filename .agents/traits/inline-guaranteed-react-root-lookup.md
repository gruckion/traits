---
name: inline-guaranteed-react-root-lookup
subject: "React client mounting into application-owned HTML root elements. In
  TSX, JSX, or HTML files. Exception: When the DOM elements under assessment are
  not guaranteed to exist by application-owned HTML and therefore require null
  handling."
assertion: 'In a React client entry point, when the application-owned HTML
  guarantees the root element exists, inline its lookup into createRoot and use
  a non-null assertion:
  createRoot(document.getElementById("root")!).render(...). Keep the matching
  root element in the HTML; retain null handling for DOM elements whose presence
  is not guaranteed.'
purpose: Keep guaranteed application startup paths direct while retaining null
  handling where absence is possible.
---
```diff
-const root = document.getElementById("root")
-if (root) createRoot(root).render(<App />)
+createRoot(document.getElementById("root")!).render(<App />)
```
