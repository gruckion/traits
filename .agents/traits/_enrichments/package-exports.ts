import { Array, Effect, FileSystem, Path, pipe, Schema as S } from "effect"
import { Enrichment } from "traits"

/** The package.json fields that declare a package's entry points. */
const PackageManifest = S.Struct({
  name: S.String.pipe(S.optionalKey),
  main: S.String.pipe(S.optionalKey),
  exports: S.Unknown.pipe(S.optionalKey)
})

/** Every file target in an exports value: a path, an array of fallbacks, or nested subpath and condition objects. */
const exportTargets = (value: unknown): ReadonlyArray<string> => {
  if (typeof value === "string") {
    return [value]
  }
  if (globalThis.Array.isArray(value)) {
    return Array.flatMap(value, exportTargets)
  }
  return typeof value === "object" && value !== null ? Array.flatMap(Object.values(value), exportTargets) : []
}

/** Tells assessments whether the checked file is an entry point of its nearest package, as declared by package.json exports (or main when there are no exports), which the file itself cannot show. */
export default Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  // This module lives in .agents/traits/_enrichments, three directories below the workspace root.
  const root = path.resolve(import.meta.dirname, "..", "..", "..")
  return Effect.gen(function* () {
    const { input } = yield* Enrichment.EnrichmentContext
    const file = input._tag === "After" ? input.change.after.path : input.change.before.path
    const segments = file.split("/").slice(0, -1)
    // Nearest enclosing directory first, ending at the workspace root.
    const directories = Array.map(Array.range(0, segments.length), (depth) =>
      segments.slice(0, segments.length - depth).join("/")
    )
    for (const directory of directories) {
      const manifestPath = path.join(root, directory, "package.json")
      if (!(yield* fs.exists(manifestPath))) {
        continue
      }
      const manifestFile = directory === "" ? "package.json" : `${directory}/package.json`
      const manifest = yield* fs.readFileString(manifestPath).pipe(
        Effect.flatMap(S.decodeEffect(S.fromJsonString(PackageManifest))),
        Effect.mapError(() =>
          Enrichment.EnrichmentError.make({
            reason: Enrichment.EnrichmentErrorReason.cases.Enrichment.make({}),
            instruction: `Fix ${manifestFile} so it is valid JSON with string name and main fields, then check again.`
          })
        )
      )
      const declared = manifest.exports === undefined ? (manifest.main === undefined ? [] : [manifest.main]) : exportTargets(manifest.exports)
      const entryPoints = pipe(
        declared,
        Array.filter((target) => target.startsWith("./") || !target.includes(":")),
        Array.map((target) => path.posix.normalize(directory === "" ? target : `${directory}/${target}`)),
        Array.dedupe
      )
      const name = manifest.name === undefined ? manifestFile : `${manifest.name} (${manifestFile})`
      const listed = entryPoints.length === 0 ? "declares no entry points" : `declares these entry points: ${entryPoints.join(", ")}`
      return Array.contains(entryPoints, file)
        ? `${file} is an entry point of package ${name}, which ${listed}.`
        : `${file} is not a package entry point; it is internal to package ${name}, which ${listed}.`
    }
    return `No package.json encloses ${file}, so it is not a package entry point.`
  })
})
