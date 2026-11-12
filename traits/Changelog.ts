import { Array, Effect, Function, Option, Order, pipe, Schema as S, String } from "effect"
import { HttpClient, HttpIncomingMessage } from "effect/http"

import PackageJson from "./package.json" with { type: "json" }
import * as Version from "./Version.ts"

/** One released version and its changelog notes. */
export type Release = typeof Release.Type
export const Release = S.Struct({
  /** The released version. */
  version: Version.Version.annotateKey({ description: "The released version." }),
  /** The version's changelog notes in Markdown, without its version heading. */
  notes: S.String.annotate({ description: "The version's changelog notes in Markdown, without its version heading." })
}).annotate({ description: "One released version and its changelog notes." })

const ReleaseHeading = S.TemplateLiteralParser(["## ", Version.Version])

/** Splits a Changesets changelog into releases at its `## <version>` headings, in file order. */
export const parse = (changelog: string): ReadonlyArray<Release> =>
  pipe(
    changelog,
    String.split("\n"),
    Array.reduce(
      [] as ReadonlyArray<{ readonly version: string; readonly lines: ReadonlyArray<string> }>,
      (sections, line) =>
        pipe(
          line,
          String.trimEnd,
          S.decodeUnknownOption(ReleaseHeading),
          Option.match({
            onSome: ([, version]) => [...sections, { version, lines: [] }],
            onNone: () => {
              const last = Array.last(sections)
              return last._tag === "None"
                ? sections
                : [...Array.dropRight(sections, 1), { version: last.value.version, lines: [...last.value.lines, line] }]
            }
          })
        )
    ),
    Array.map((section) => ({ version: section.version, notes: pipe(section.lines, Array.join("\n"), String.trim) }))
  )

/** Releases newer than `from` and no newer than `to`, oldest first, so changes can be applied in order. */
export const between: {
  (range: { readonly from: string; readonly to: string }): (releases: ReadonlyArray<Release>) => ReadonlyArray<Release>
  (releases: ReadonlyArray<Release>, range: { readonly from: string; readonly to: string }): ReadonlyArray<Release>
} = Function.dual(2, (releases: ReadonlyArray<Release>, range: { readonly from: string; readonly to: string }) =>
  pipe(
    releases,
    Array.filter(
      (release) => Version.isNewer(release.version, range.from) && !Version.isNewer(release.version, range.to)
    ),
    Array.sort(Order.make((self: Release, that: Release) => Version.compare(self.version, that.version)))
  )
)

/** Looks up the latest published traits version on the npm registry. */
export const latestVersion = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient.pipe(Effect.map(HttpClient.filterStatusOk))
  const response = yield* client.get(`https://registry.npmjs.org/${PackageJson.name}`)
  const metadata = yield* pipe(
    response,
    HttpIncomingMessage.schemaBodyJson(S.Struct({ "dist-tags": S.Struct({ latest: Version.Version }) }))
  )
  return metadata["dist-tags"].latest
}).pipe(Effect.withSpan("Changelog.latestVersion"))

/** Fetches the complete changelog as of a published version, from the repository at that version's release tag. */
export const fetchReleases = Effect.fn("Changelog.fetchReleases")(function* (version: string) {
  const client = yield* HttpClient.HttpClient.pipe(Effect.map(HttpClient.filterStatusOk))
  const response = yield* client.get(changelogUrl(version))
  return yield* response.text.pipe(Effect.map(parse))
})

const changelogUrl = (version: string) =>
  `https://raw.githubusercontent.com/crosshatch/traits/${PackageJson.name}%40${version}/${PackageJson.repository.directory}/CHANGELOG.md`
