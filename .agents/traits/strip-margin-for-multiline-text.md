---
name: strip-margin-for-multiline-text
subject: Large multiline text literals in TypeScript and TSX, whether or not
  Effect String.stripMargin is already used. Includes embedded Markdown,
  prompts, instructions, and illustrative code or diffs.
assertion: "Write large text strings as multiline template literals using
  Effect’s String.stripMargin, with a leading | on each text line. This requires
  using String.stripMargin for raw multiline text literals as well: its absence
  is a violation, not a reason to skip assessment. Align every | and the closing
  backtick with the anchor: the nearest property or variable whose entire value
  is the stripMargin call, without an extra indentation level. How deeply that
  property sits inside other calls, callbacks, or objects is irrelevant. Extract
  the text into a named constant (aligned with that declaration) only when the
  stripMargin call is not itself the whole value of a property or variable,
  e.g. a ternary branch or an argument to another call."
purpose: Keep multiline text readable in source without leaking incidental code
  indentation into its content.
---
Check two independent conditions: the large multiline literal uses Effect String.stripMargin, and its margin markers and closing backtick are aligned correctly. Correct rendered output alone does not satisfy the first condition. Preserve meaningful indentation after the margin markers. Explicit trimming may preserve intentional leading/trailing newline behavior.

Missing String.stripMargin is a violation:

```diff
-const instructions = `Keep the text concise.
-Preserve important details.
-Explain the exceptions.`
+const instructions = String.stripMargin(`
+|Keep the text concise.
+|Preserve important details.
+|Explain the exceptions.
+`)
```

Marker alignment:

```diff
 const instructions = String.stripMargin(`
-  | Keep the text concise.
-  `)
+| Keep the text concise.
+`)
```

Direct property call:

```ts
const example = {
  instructions: String.stripMargin(`
  | text
  `)
}
```

Deeply nested direct property call (correct; the anchor is `task`, the property whose whole value is the call):

```ts
const run = Effect.gen(function*() {
  return yield* Effect.forEach(items, (item) =>
    model.generate({
      prompt: {
        task: String.stripMargin(`
        |Assess the assertion against the target.
        |Use only that entry's context.
        `),
      },
    }))
})
```

Nested inside another expression (violation; extract a constant):

```diff
-const prompt = verbose ? String.stripMargin(`
-|Explain each step.
-`) : short
+const verboseText = String.stripMargin(`
+|Explain each step.
+`)
+const prompt = verbose ? verboseText : short
```
