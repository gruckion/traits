import { Array, Console, Effect, FileSystem, Option, Path, pipe, Schema as S, String } from "effect"
import { Command, Flag } from "effect/cli"
import { FetchHttpClient } from "effect/http"

import * as Changelog from "../../../Changelog.ts"
import PackageJson from "../../../package.json" with { type: "json" }
import * as Version from "../../../Version.ts"
import * as WorkspaceLayout from "../../../WorkspaceLayout.ts"

/** Everything an agent needs to migrate a workspace from one traits version to the latest release. */
export interface UpdateContext {
  /** The version the workspace was last migrated to, and where that version came from. */
  readonly from: { readonly version: string; readonly source: "flag" | "workspace" | "installed" }
  /** The installed traits version. */
  readonly installed: string
  /** The latest published traits version. */
  readonly latest: string
  /** Releases after `from` up to `latest`, oldest first. */
  readonly releases: ReadonlyArray<Changelog.Release>
}

const sourceLabel = {
  flag: "--from",
  workspace: ".agents/traits/_traits.json",
  installed: "installed version; .agents/traits/_traits.json has no readable version"
} as const

/** Renders migration context as Markdown for an agent to act on; the agent, not this command, performs the migration. */
export const render = (context: UpdateContext): string => {
  const { from, installed, latest, releases } = context
  const summary = [
    "# Traits update",
    "",
    `- Workspace version (${sourceLabel[from.source]}): ${from.version}`,
    `- Installed version: ${installed}`,
    `- Latest published version: ${latest}`
  ]
  if (!Version.isNewer(latest, from.version)) {
    return pipe(
      [...summary, "", `Nothing has been released after ${from.version}; no migration is needed.`],
      Array.join("\n")
    )
  }
  return pipe(
    [
      ...summary,
      "",
      "## Migration",
      "",
      "Perform this migration yourself; no command rewrites configuration or trait files.",
      "",
      ...(Version.isNewer(latest, installed)
        ? [`1. Upgrade traits to ${latest}.`]
        : [`1. Keep traits at ${latest} or later.`]),
      `2. Read each release below, oldest first, and apply every change it describes to .agents/traits/_traits.json and the workspace's trait files, validating them against the upgraded package's schemas.`,
      `3. Set "version" in .agents/traits/_traits.json to ${latest}.`,
      "",
      `## Releases after ${from.version}`,
      ...Array.flatMap(releases, (release) => [
        "",
        `### ${release.version}`,
        "",
        // Nest the release's own headings beneath its version heading.
        pipe(release.notes, String.replace(/^(#+ )/gmu, "#$1")) || "No notes."
      ])
    ],
    Array.join("\n")
  )
}

/** Reads only the version from .agents/traits/_traits.json, since the rest may not match the current schema yet. */
const workspaceVersion = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.resolve(WorkspaceLayout.config)
  if (!(yield* fs.exists(file))) {
    return undefined
  }
  const text = yield* fs.readFileString(file)
  return yield* pipe(
    text,
    S.decodeEffect(S.fromJsonString(S.Struct({ version: Version.Version }))),
    Effect.map((config): string | undefined => config.version),
    Effect.orElseSucceed(() => undefined)
  )
})

/** Prints what changed since the workspace's traits version so an agent can migrate configuration and trait files. */
export const update = Command.make(
  "update",
  {
    from: Flag.String("from").pipe(
      Flag.withSchema(Version.Version),
      Flag.withDescription("Version to migrate from instead of the one in .agents/traits/_traits.json"),
      Flag.optional
    )
  },
  Effect.fn("update")(function* (params) {
    const flagged = Option.getOrUndefined(params.from)
    const configured = flagged === undefined ? yield* workspaceVersion : undefined
    const from: UpdateContext["from"] =
      flagged !== undefined
        ? { version: flagged, source: "flag" }
        : configured !== undefined
          ? { version: configured, source: "workspace" }
          : { version: PackageJson.version, source: "installed" }
    const latest = yield* Changelog.latestVersion
    let releases: ReadonlyArray<Changelog.Release> = []
    if (Version.isNewer(latest, from.version)) {
      const changelog = yield* Changelog.fetchReleases(latest)
      releases = Changelog.between(changelog, { from: from.version, to: latest })
    }
    yield* Console.log(render({ from, installed: PackageJson.version, latest, releases }))
  })
).pipe(
  Command.withDescription("Print the changes since this workspace's traits version so an agent can migrate it"),
  Command.provide(FetchHttpClient.layer)
)
