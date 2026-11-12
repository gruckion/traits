import { expect, it } from "@effect/vitest"
import { Array, Effect, pipe, String } from "effect"
import { type Change, fromSegment, Segment, Segmenter, WorkspacePath } from "traits"

import setup from "../segmenter/index.ts"

it.effect("selects nonoverlapping top-level statements with UTF-16 offsets and no historical mapping", () =>
  Effect.gen(function* () {
    const segment = yield* setup
    const statements = [
      'import type { Value } from "./value.ts";',
      'const emoji = "😀";',
      'export function greet(value: string) { const nested = "你好"; return value + nested; }',
      "export interface Result { value: string }",
      'export const View = () => <div title="😀">Hello</div>;'
    ]
    const text = Array.join(statements, "\n")
    const change: Change = {
      before: { path: WorkspacePath.make("old.ts"), text: "this before-source need not parse" },
      after: { path: WorkspacePath.make("new.tsx"), text }
    }
    const segments = yield* segment(change)
    expect(Array.map(segments, (entry) => pipe(text, String.slice(entry.range.start, entry.range.end)))).toEqual(
      statements
    )
    for (const entry of segments) {
      expect(Segment.guards.After(entry)).toBe(true)
      expect("before" in entry).toBe(false)
      yield* fromSegment(change, entry)
    }
  })
)

it.effect("segments creations and whole-file deletions, allowing valid files with no statements", () =>
  Effect.gen(function* () {
    const segment = yield* setup
    const source = { path: WorkspacePath.make("file.ts"), text: "const value: number = 1;" }
    const created = yield* segment({ after: source })
    expect(created).toEqual([{ _tag: "After", range: { start: 0, end: source.text.length } }])
    const deleted = yield* segment({ before: source })
    expect(deleted).toEqual([{ _tag: "Before", range: { start: 0, end: source.text.length } }])
    for (const text of ["", " \n\t", "// comment only\n/* another comment */"]) {
      const empty = yield* segment({ after: { path: WorkspacePath.make("empty.ts"), text } })
      expect(empty).toEqual([])
    }
    for (const path of ["file.js", "file.jsx", "file.mjs", "file.cjs", "file.mts", "file.cts", "file.d.ts"]) {
      const selected = yield* segment({ after: { path: WorkspacePath.make(path), text: "const value = 1;" } })
      expect(selected).toHaveLength(1)
    }
  })
)

it.effect("fails the entire selection on syntax errors without exposing source text", () =>
  Effect.gen(function* () {
    const segment = yield* setup
    const source = { path: WorkspacePath.make("broken.ts"), text: 'const secret = "do-not-report-this"; const = ;' }
    for (const change of [{ after: source }, { before: source }]) {
      const error = yield* segment(change).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Segmenter.SegmenterError)
      expect(error.instruction).toContain("broken.ts")
      expect(error.instruction).toContain("syntax")
      expect(error.instruction).not.toContain("do-not-report-this")
    }
    // Other file types have no statements to assess, so checking them against TypeScript traits stays complete.
    expect(yield* segment({ after: { path: WorkspacePath.make("data.json"), text: "{}" } })).toEqual([])
  })
)
