import { pipe } from "effect"
import { expect, it } from "vite-plus/test"

import * as Trait from "../Trait.ts"
import { excludeIgnored, traitIgnores } from "../traitIgnores.ts"

const first = Trait.Trait.make({
  name: Trait.TraitName.make("direct-callbacks"),
  subject: "Callbacks.",
  requirement: "Pass callbacks directly.",
  purpose: "Avoid redundant forwarding wrappers."
})
const second = Trait.Trait.make({
  name: Trait.TraitName.make("use-arrow-functions"),
  subject: "Ordinary functions.",
  requirement: "Use arrow functions.",
  purpose: "Keep function syntax consistent."
})

it("reads repeated directives from the leading header", () => {
  const references = traitIgnores(
    "#!/usr/bin/env node\n\n// header\n// traits-ignore-file first: reason\n// traits-ignore-file second: another reason\nimport 'module'"
  )
  expect([...references]).toEqual(["first", "second"])
})

it("requires a reason and exactly one reference", () => {
  expect([
    ...traitIgnores(
      "// traits-ignore-file first\n// traits-ignore-file second:   \n// traits-ignore-file first second: reason"
    )
  ]).toEqual([])
})

it("supports leading single-line HTML comments without accepting malformed or late directives", () => {
  expect([
    ...traitIgnores("<!-- header -->\n<!-- traits-ignore-file first: pre-paint boundary -->\n<!doctype html>")
  ]).toEqual(["first"])
  for (const text of [
    "<!-- traits-ignore-file first: -->\n<!doctype html>",
    "<!-- traits-ignore-file first second: invalid -->\n<!doctype html>",
    "<!-- traits-ignore-file first: unterminated\n<!doctype html>",
    "<!doctype html>\n<!-- traits-ignore-file first: too late -->"
  ])
    expect([...traitIgnores(text)]).toEqual([])
})

it("does not interpret strings or comments after code", () => {
  expect([
    ...traitIgnores("const text = `\n// traits-ignore-file first: reason\n`\n// traits-ignore-file second: reason")
  ]).toEqual([])
})

it("handles CRLF and deduplicates references", () => {
  expect([...traitIgnores("// traits-ignore-file first: reason\r\n// traits-ignore-file first: repeated\r\n")]).toEqual(
    ["first"]
  )
})

it("selects exact unique names and supports multiple exceptions", () => {
  expect(pipe([first, second], excludeIgnored(`// traits-ignore-file ${first.name}: exception`))).toEqual([second])
  const header = `// traits-ignore-file ${first.name}: first exception\n// traits-ignore-file ${second.name}: second exception\nconst value = 1`
  expect(pipe([first, second], excludeIgnored(header))).toEqual([])
})

it("does not match partial names, different casing, filenames, or unknown references", () => {
  const header = `// traits-ignore-file direct: partial\n// traits-ignore-file Direct-callbacks: wrong casing\n// traits-ignore-file ${first.name}.md: filename\n// traits-ignore-file unknown-trait: unknown`
  expect(pipe([first, second], excludeIgnored(header))).toEqual([first, second])
})

it("requires references to be updated after renaming", () => {
  const renamed = Trait.Trait.make({ ...first, name: Trait.TraitName.make("renamed-callbacks") })
  expect(pipe([renamed], excludeIgnored(`// traits-ignore-file ${first.name}: old name`))).toEqual([renamed])
  expect(pipe([renamed], excludeIgnored(`// traits-ignore-file ${renamed.name}: new name`))).toEqual([])
})

it("does not apply directives without reasons or after code", () => {
  expect(pipe([first], excludeIgnored(`// traits-ignore-file ${first.name}:   `))).toEqual([first])
  expect(pipe([first], excludeIgnored(`const value = 1\n// traits-ignore-file ${first.name}: too late`))).toEqual([
    first
  ])
})
