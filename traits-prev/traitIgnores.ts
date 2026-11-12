import { Array, flow, Option, pipe, Schema as S, String } from "effect"

import type { Trait } from "./Trait.ts"

const decodeComment = S.String.pipe(
  S.decodeTo(S.Union([S.TemplateLiteralParser(["//", S.String]), S.TemplateLiteralParser(["<!--", S.String, "-->"])])),
  S.decodeUnknownOption
)
const decodeDirective = S.String.pipe(
  S.decodeTo(
    S.TemplateLiteralParser([
      "traits-ignore-file",
      S.String.check(S.isPattern(/^\s+\S+\s*$/)),
      ":",
      S.String.check(S.isPattern(/^\s*\S[\s\S]*$/))
    ])
  ),
  S.decodeUnknownOption
)

/** File-scoped exceptions require a reason in a leading // or single-line HTML comment header. */
export const traitIgnores = (text: string): ReadonlySet<string> => {
  const references = new Set<string>()
  for (const line of String.split(text, "\n")) {
    const trimmed = String.trim(line)
    if (trimmed === "" || pipe(trimmed, String.startsWith("#!"))) continue
    const comment = pipe(trimmed, decodeComment, Option.getOrUndefined)
    if (comment === undefined) break
    const directive = pipe(comment[1], String.trim, decodeDirective, Option.getOrUndefined)
    if (directive !== undefined) references.add(String.trim(directive[1]))
  }
  return references
}

/** References match unique trait names exactly. */
export const excludeIgnored = flow(traitIgnores, (references) =>
  Array.filter<Trait>((trait) => !references.has(trait.name))
)
