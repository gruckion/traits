---
name: css-first-scroll-layout
subject: "Scroll-dependent UI layout, positioning, and visibility. In CSS, HTML,
  TSX, JSX, TypeScript, or JavaScript files. Exception: When every scripted
  scroll-dependent behavior under assessment implements a requirement that DOM
  placement, layout, and CSS cannot reliably express."
assertion: Prefer DOM placement, appropriate containing blocks, and CSS
  positioning for scroll-dependent UI layout such as sticky bars. Do not add
  JavaScript scroll listeners, visibility atoms, or reveal/hide logic when CSS
  can reliably express the intended behavior. Use scripted behavior only when
  the requirement cannot be achieved reliably through layout and styling.
purpose: Keep scroll-dependent presentation reliable through native layout
  rather than synchronizing JavaScript with scrolling.
---
```diff
-window.addEventListener("scroll", () => header.classList.toggle("fixed", window.scrollY > 100))
+/* Place the header in its intended scroll container. */
+header { position: sticky; top: 0; }
```
