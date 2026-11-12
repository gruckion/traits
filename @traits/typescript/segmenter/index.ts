import { Array, Effect } from "effect"
import { type Change, Segment, Segmenter } from "traits"

/** Selects top-level statements from the after-source, or the before-source for whole-file deletions; files that are not JavaScript or TypeScript have none. Historical mappings are not computed. */
export default Effect.gen(function* () {
  const { parseSync } = yield* Effect.tryPromise({
    try: () => import("oxc-parser"),
    catch: () =>
      Segmenter.SegmenterSetupError.make({
        instruction:
          "Could not load oxc-parser. Reinstall @traits/typescript with its platform-specific optional dependencies enabled and use a supported Node.js version, then restart trait evaluation."
      })
  })
  return Effect.fn("TypeScript.segment")(function* (change: Change) {
    const source = (change.after ?? change.before)!
    // Other file types contain no JavaScript or TypeScript statements, so there is nothing to select or assess.
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/iu.test(source.path)) {
      return []
    }
    const result = yield* Effect.sync(() => parseSync(source.path, source.text)).pipe(
      Effect.filterOrFail(
        (result) => Array.every(result.errors, (error) => error.severity !== "Error"),
        (result) =>
          Segmenter.SegmenterError.make({
            instruction: `Could not parse ${source.path} (${change.after === undefined ? "before" : "after"} source; ${Array.filter(result.errors, (error) => error.severity === "Error").length} syntax error(s)). Fix the source syntax or choose a segmenter that supports its language, then rerun evaluation.`
          })
      )
    )
    return Array.map(result.program.body, (statement) => {
      const range = { start: statement.start, end: statement.end }
      return change.after === undefined ? Segment.cases.Before.make({ range }) : Segment.cases.After.make({ range })
    })
  })
}) satisfies Segmenter.Segmenter
