import { expect, it } from "@effect/vitest"
import { Array, pipe, String } from "effect"

import * as Changelog from "../Changelog.ts"
import { render } from "../Cli/commands/update/update.ts"

const changelog = String.stripMargin(`
|# traits
|
|## 0.6.0
|
|### Minor Changes
|
|- Rename \`requirement\` to \`assertion\` in trait frontmatter.
|
|## 0.5.15
|
|### Patch Changes
|
|- Fix derivation.
|
|## 0.5.14
|
|### Patch Changes
|
|- Preserve approvals.
|`)

it("splits a Changesets changelog into releases and selects a range oldest first", () => {
  const releases = Changelog.parse(changelog)
  expect(Array.map(releases, (release) => release.version)).toEqual(["0.6.0", "0.5.15", "0.5.14"])
  expect(releases[0]!.notes).toBe("### Minor Changes\n\n- Rename `requirement` to `assertion` in trait frontmatter.")
  expect(Array.map(Changelog.between(releases, { from: "0.5.14", to: "0.6.0" }), (release) => release.version)).toEqual(
    ["0.5.15", "0.6.0"]
  )
  expect(
    pipe(
      releases,
      Changelog.between({ from: "0.5.13", to: "0.5.15" }),
      Array.map((release) => release.version)
    )
  ).toEqual(["0.5.14", "0.5.15"])
  expect(Changelog.between(releases, { from: "0.6.0", to: "0.6.0" })).toEqual([])
})

it("renders migration context for an agent, nesting each release's headings under its version", () => {
  const releases = Changelog.between(Changelog.parse(changelog), { from: "0.5.14", to: "0.6.0" })
  const text = render({
    from: { version: "0.5.14", source: "workspace" },
    installed: "0.5.14",
    latest: "0.6.0",
    releases
  })
  expect(text).toContain("- Workspace version (.agents/traits/_traits.json): 0.5.14")
  expect(text).toContain("1. Upgrade traits to 0.6.0.")
  expect(text).toContain('3. Set "version" in .agents/traits/_traits.json to 0.6.0.')
  expect(text).toMatch(/### 0\.5\.15[\s\S]*### 0\.6\.0/u)
  expect(text).toContain("### 0.6.0\n\n#### Minor Changes")
  const installedLatest = render({
    from: { version: "0.5.14", source: "flag" },
    installed: "0.6.0",
    latest: "0.6.0",
    releases
  })
  expect(installedLatest).not.toContain("Upgrade traits")
  const upToDate = render({
    from: { version: "0.6.0", source: "installed" },
    installed: "0.6.0",
    latest: "0.6.0",
    releases: []
  })
  expect(upToDate).toContain("no migration is needed")
  expect(upToDate).not.toContain("## Migration")
})
