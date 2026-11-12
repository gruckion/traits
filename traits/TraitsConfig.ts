import { Effect, FileSystem, Path, pipe, Schema as S } from "effect"

import { Models } from "./Models.ts"
import PackageJson from "./package.json" with { type: "json" }
import { TraitSources } from "./TraitsEnvironment/TraitSources.ts"
import * as Version from "./Version.ts"
import * as WorkspaceLayout from "./WorkspaceLayout.ts"
import { WorkspaceRoot } from "./WorkspaceRoot.ts"

/** The workspace configuration in .agents/traits/_traits.json: plain JSON, so it loads without executing code or installing JavaScript dependencies. Every .agents/traits/<name>.md file is a trait; environments narrow which are checked. Unknown keys are rejected so outdated files are reported rather than misread. */
export type TraitsConfig = typeof TraitsConfig.Type
export const TraitsConfig = S.Struct({
  /** A JSON Schema URL for editor validation and completion; ignored by traits. */
  $schema: S.String.annotateKey({
    description: "A JSON Schema URL for editor validation and completion; ignored by traits."
  }).pipe(S.optionalKey),
  /** The traits version this workspace's configuration and trait files were last migrated to. */
  version: Version.Version.annotateKey({
    description: "The traits version this workspace's configuration and trait files were last migrated to."
  }),
  /** Trait collections from other repositories to check in addition to the workspace's own traits; not supported yet. */
  extends: TraitSources.annotateKey({
    description:
      "Trait collections from other repositories to check in addition to the workspace's own traits; not supported yet."
  }).pipe(S.optionalKey),
  models: Models,
  /** The maximum number of simultaneous decision model requests; 16 when omitted. */
  concurrency: S.Int.check(S.isGreaterThanOrEqualTo(1))
    .pipe(S.withDecodingDefaultKey(Effect.succeed(16)))
    .annotateKey({ description: "The maximum number of simultaneous decision model requests; 16 when omitted." })
}).annotate({
  description:
    "The workspace configuration in .agents/traits/_traits.json: plain JSON, so it loads without executing code or installing JavaScript dependencies."
})

/** .agents/traits/_traits.json could not be read. */
export class TraitsConfigReadError extends S.TaggedError<TraitsConfigReadError>()("TraitsConfigReadError", {
  /** The configuration file path. */
  path: S.String.annotateKey({ description: "The configuration file path." }),
  /** The underlying filesystem failure. */
  cause: S.Defect().annotateKey({ description: "The underlying filesystem failure." })
}) {
  override get message(): string {
    return `Could not read ${this.path}. Create it with a version and models for language and decision.`
  }
}

/** .agents/traits/_traits.json is not valid JSON or does not match the current schema. */
export class TraitsConfigDecodeError extends S.TaggedError<TraitsConfigDecodeError>()("TraitsConfigDecodeError", {
  /** The configuration file path. */
  path: S.String.annotateKey({ description: "The configuration file path." }),
  /** The JSON or schema validation failure. */
  cause: S.Defect().annotateKey({ description: "The JSON or schema validation failure." })
}) {
  override get message(): string {
    return `${this.path} does not match the schema expected by traits ${PackageJson.version}: ${globalThis.String(this.cause)}\nIf it was written for an earlier version, run \`traits update\` and follow its migration steps.`
  }
}

/** .agents/traits/_traits.json was written for a traits version incompatible with the installed one. */
export class TraitsConfigVersionError extends S.TaggedError<TraitsConfigVersionError>()("TraitsConfigVersionError", {
  /** The configuration file path. */
  path: S.String.annotateKey({ description: "The configuration file path." }),
  /** The version recorded in the configuration. */
  configured: S.String.annotateKey({ description: "The version recorded in the configuration." }),
  /** The installed traits version. */
  installed: S.String.annotateKey({ description: "The installed traits version." })
}) {
  override get message(): string {
    return Version.status(this.configured, this.installed) === "Newer"
      ? `${this.path} requires traits ${this.configured}, but ${this.installed} is installed. Upgrade traits before checking.`
      : `${this.path} was migrated for traits ${this.configured}, but ${this.installed} is installed and may read configuration or trait files differently. Run \`traits update\` and follow its migration steps for .agents/traits/_traits.json and every trait file.`
  }
}

/** Loads and validates .agents/traits/_traits.json from the workspace root, failing when it was written for an incompatible traits version. */
export const load = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { directory } = yield* WorkspaceRoot
  const file = path.join(directory, WorkspaceLayout.config)
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError((cause) => TraitsConfigReadError.make({ path: file, cause })))
  const config = yield* pipe(
    text,
    S.decodeEffect(S.fromJsonString(TraitsConfig), { onExcessProperty: "error" }),
    Effect.mapError((cause) => TraitsConfigDecodeError.make({ path: file, cause }))
  )
  if (Version.status(config.version, PackageJson.version) !== "Compatible") {
    return yield* TraitsConfigVersionError.make({
      path: file,
      configured: config.version,
      installed: PackageJson.version
    })
  }
  return config
}).pipe(Effect.withSpan("TraitsConfig.load"))
