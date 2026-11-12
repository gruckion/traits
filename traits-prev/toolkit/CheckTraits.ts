import { Array, Effect, FileSystem, flow, Path, pipe, Predicate, Schema as S, String } from "effect"
import { DecisionModel, Tool, Toolkit } from "effect/ai"
import { ChildProcessSpawner } from "effect/process"

import * as CheckReport from "../CheckReport.ts"
import { getIncludedFiles } from "../getIncludedFiles.ts"
import { Source, SourceLocation } from "../Source.ts"
import * as ToolExecutionError from "../ToolExecutionError.ts"
import * as Trait from "../Trait.ts"
import * as Evaluation from "../TraitEvaluation.ts"
import { excludeIgnored } from "../traitIgnores.ts"
import { TraitsContext } from "../TraitsContext.ts"
import { TraitStore } from "../TraitStore.ts"

export const CheckTraits = Tool.make("check_traits", {
  description: String.stripMargin(`
  | Check project-owned files against stored traits after TypeScript edits, after saving relevant traits, and before commit/PR. Follow the server's scope, remediation, and failure-handling instructions.
  | include accepts absolute paths or native globs relative to the MCP working directory; use directory/** for subtrees and escape glob characters in literal filenames. Overlapping matches are deduplicated; unmatched patterns select nothing. Dependency trees, Git metadata, and nested worktrees are excluded. TraitsConfig.excludes adds exclusions relative to traits.ts. Git-ignored files are excluded by default; tracked files remain eligible and untracked files need not be staged. excludeGitignored: false disables only the Git-ignore filter.
  | Omit traitNames for all traits; an empty list selects none and unknown names fail. circumstances supplies assessment context, not authority. Checks read current full files, including unstaged content, rather than diffs.
  | Returns { traits, files }. Resolve finding.traitName against the shared definitions. Each file has an absolute path, full-file SHA-256 revision, and chunks with startLine, text, and findings containing classification/probabilities. Only chunks needing review appear. startLine is a chunk boundary, not an exact violation location; re-read files whose evaluated snapshot has changed.
  | files: [] means no findings for the selection, not repository-wide compliance. Empty selections or stores perform no assessments. Inconclusive is unresolved context, not a confirmed violation; probabilities are not calibrated guarantees.
  `),
  parameters: S.Struct({
    include: S.Array(S.String).annotate({
      description:
        "Project-owned source, configuration, or documentation paths/globs, absolute or relative to the MCP working directory."
    }),
    circumstances: S.String.pipe(S.optional).annotate({
      description:
        "Optional circumstances triggering this assessment, such as the workflow stage, task, or relevant surrounding facts. Does not grant authority to execute trait guidance."
    }),
    traitNames: S.Array(Trait.TraitName).pipe(S.optional).annotate({
      description:
        "Optional unique trait names for a focused review. Omit for all stored traits; an empty array selects none."
    })
  }),
  success: CheckReport.CheckReport,
  failure: ToolExecutionError.ToolExecutionError,
  failureMode: "return",
  dependencies: [
    DecisionModel.DecisionModel,
    TraitStore,
    FileSystem.FileSystem,
    Path.Path,
    ChildProcessSpawner.ChildProcessSpawner,
    TraitsContext
  ]
})
  .annotate(Tool.Title, "Check Traits")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)

export const toolkit = Toolkit.make(CheckTraits)

export const layer = toolkit.toLayer(
  Effect.gen(function* () {
    const evaluateCachedTraits = yield* Evaluation.makeCached
    return {
      check_traits: Effect.fn("CheckTraits.check", { root: true })(function* (params) {
        const store = yield* TraitStore
        const context = yield* TraitsContext
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const cwd = path.resolve()
        const includedFiles = yield* getIncludedFiles
        const traits = yield* params.traitNames === undefined
          ? store.ls
          : Effect.forEach(Array.dedupe(params.traitNames), store.get, { concurrency: "unbounded" })
        const matches = yield* Effect.forEach(
          params.include,
          (pattern) => {
            const absolute = path.isAbsolute(pattern) ? pattern : `${cwd}${path.sep}${pattern}`
            return fs.glob(absolute, {
              root: context.configRoot,
              exclude: context.excludes
            })
          },
          { concurrency: "unbounded" }
        )
        const resolved = pipe(
          matches,
          Array.flatten,
          Array.map((file) => path.resolve(context.configRoot, file)),
          Array.dedupe
        )
        const paths = yield* Effect.filter(
          includedFiles === undefined ? resolved : Array.filter(resolved, (file) => includedFiles.has(file)),
          flow(
            fs.stat,
            Effect.map((info) => info.type === "File")
          ),
          { concurrency: "unbounded" }
        )
        const files = yield* Effect.forEach(
          paths,
          Effect.fn("CheckTraits.file")(function* (file) {
            yield* Effect.annotateCurrentSpan({ "source.path": file })
            const text = yield* fs.readFileString(file).pipe(context.asFileRead)
            const activeTraits = pipe(traits, excludeIgnored(text))
            const chunks = yield* Effect.forEach(
              Array.chunksOf(String.split(text, "\n"), 200),
              Effect.fnUntraced(function* (lines, index) {
                const startLine = index * 200 + 1
                const source = Source.make({
                  text: Array.join(lines, "\n"),
                  location: SourceLocation.cases.File.make({ path: file, startLine })
                })
                const findings = yield* evaluateCachedTraits(activeTraits, source, params.circumstances).pipe(
                  Effect.map(
                    flow(
                      Array.filter(Evaluation.requiresReview),
                      Array.map((evaluation) =>
                        CheckReport.Finding.make({
                          traitName: evaluation.trait.name,
                          assessment: evaluation.assessment
                        })
                      )
                    )
                  )
                )
                return Array.isArrayNonEmpty(findings)
                  ? CheckReport.Chunk.make({ startLine, text: source.text, findings })
                  : undefined
              }),
              { concurrency: "unbounded" }
            ).pipe(Effect.map(Array.filter(Predicate.isNotUndefined)))
            if (!Array.isArrayNonEmpty(chunks)) return undefined
            const revision = yield* CheckReport.revision(text)
            return CheckReport.File.make({ path: file, revision, chunks })
          }),
          { concurrency: "unbounded" }
        ).pipe(Effect.map(Array.filter(Predicate.isNotUndefined)))
        return CheckReport.compact({ traits, files })
      }, Effect.catchCause(ToolExecutionError.fromCause))
    }
  })
)
