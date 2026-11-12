import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Segmenter } from "traits"
import { vi } from "vite-plus/test"

import setup from "../segmenter/index.ts"

vi.mock("oxc-parser", () => {
  throw new Error("Native binding unavailable")
})

it.effect("reports parser-load failures at setup with actionable guidance", () =>
  Effect.gen(function* () {
    const error = yield* setup.pipe(Effect.flip)
    expect(error).toBeInstanceOf(Segmenter.SegmenterSetupError)
    expect(error.instruction).toContain("optional dependencies")
    expect(error.instruction).toContain("restart")
  })
)
