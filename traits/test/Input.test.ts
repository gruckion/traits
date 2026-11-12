import { expect, it } from "@effect/vitest"
import { pipe, Schema as S } from "effect"

import { decisionState, Input, Segment, targetText, WorkspacePath } from "../util/util.ts"

it("selects the required source text", () => {
  const before = { path: WorkspacePath.make("old.ts"), text: "😀old" }
  const after = { path: WorkspacePath.make("new.ts"), text: "😀new" }
  const range = { start: 2, end: 5 }
  const deleted = Input.cases.Before.make({ change: { before }, segment: Segment.cases.Before.make({ range }) })
  const created = Input.cases.After.make({ change: { after }, segment: Segment.cases.After.make({ range }) })
  const updated = Input.cases.After.make({
    change: { before, after },
    segment: Segment.cases.After.make({ range, before: [range] })
  })
  expect(targetText(deleted)).toBe("old")
  expect(targetText(created)).toBe("new")
  expect(targetText(updated)).toBe("new")
})

it("rejects missing selected sources, invalid UTF-16 ranges, and unavailable historical mappings", () => {
  const source = { path: WorkspacePath.make("file.ts"), text: "😀x" }
  for (const invalid of [
    { _tag: "Before", change: { after: source }, segment: { _tag: "Before", range: { start: 0, end: 2 } } },
    { _tag: "After", change: { before: source }, segment: { _tag: "After", range: { start: 0, end: 2 } } },
    { _tag: "After", change: { after: source }, segment: { _tag: "After", range: { start: 1, end: 2 } } },
    { _tag: "Before", change: { before: source }, segment: { _tag: "Before", range: { start: 0, end: 4 } } },
    {
      _tag: "After",
      change: { after: source },
      segment: { _tag: "After", range: { start: 0, end: 2 }, before: [{ start: 0, end: 2 }] }
    },
    {
      _tag: "After",
      change: { before: source, after: source },
      segment: { _tag: "After", range: { start: 0, end: 2 }, before: [{ start: 0, end: 1 }] }
    },
    { _tag: "After", change: { after: source }, segment: { _tag: "Before", range: { start: 0, end: 2 } } }
  ]) {
    expect(pipe(invalid, S.is(Input))).toBe(false)
  }
  expect(() =>
    Input.cases.Before.make({
      change: { before: source },
      segment: Segment.cases.Before.make({ range: { start: 0, end: 4 } })
    })
  ).toThrow()
  expect(() =>
    Input.cases.After.make({
      change: { before: source, after: source },
      segment: Segment.cases.After.make({ range: { start: 0, end: 2 }, before: [{ start: 0, end: 1 }] })
    })
  ).toThrow()
})

it("sends each decision the target once, its file only when partial, and earlier text only when mapped", () => {
  const before = { path: WorkspacePath.make("old.ts"), text: "const a = 1" }
  const after = { path: WorkspacePath.make("new.ts"), text: "const a = 2\nconst b = 3" }
  const whole = Input.cases.After.make({
    change: { before, after },
    segment: Segment.cases.After.make({ range: { start: 0, end: after.text.length } })
  })
  expect(decisionState(whole)).toEqual({ path: "new.ts", version: "after", target: after.text })
  const mapped = Input.cases.After.make({
    change: { before, after },
    segment: Segment.cases.After.make({ range: { start: 0, end: 11 }, before: [{ start: 0, end: 11 }] })
  })
  expect(decisionState(mapped)).toEqual({
    path: "new.ts",
    version: "after",
    target: "const a = 2",
    source: after.text,
    history: { path: "old.ts", text: before.text, ranges: [{ start: 0, end: 11 }] }
  })
  const deleted = Input.cases.Before.make({
    change: { before },
    segment: Segment.cases.Before.make({ range: { start: 0, end: before.text.length } })
  })
  expect(decisionState(deleted)).toEqual({ path: "old.ts", version: "before", target: before.text })
})
