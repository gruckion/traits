import { Effect, pipe, Schema as S, String } from "effect"
import { Tool, Toolkit } from "effect/ai"

import { Report } from "../Report/Report.ts"
import { TraitName } from "../TraitName.ts"
import * as WorkspaceCheck from "../WorkspaceCheck.ts"
import { EnvironmentName } from "../WorkspaceTraits.ts"

/** A check could not run; the message says what to fix. */
export class TraitsCheckFailure extends S.TaggedError<TraitsCheckFailure>()("TraitsCheckFailure", {
  /** What prevented the check, and how to fix it. */
  message: S.String.annotateKey({ description: "What prevented the check, and how to fix it." })
}) {}

/** Checks workspace files against the workspace's traits using the models configured in .agents/traits/_traits.json. */
export const TraitsCheck = Tool.make("traits.check", {
  description: pipe(
    String.stripMargin(`
    |Check files against this workspace's traits after creating, editing, or deleting them, and before finishing a task or committing.
    |Pass the paths you changed; each file's current text is compared with its text at Git HEAD, so deleted files can be checked too.
    |Every trait in .agents/traits is checked unless you pass an environment or trait names the user asked for.
    |Returns the full report: for each trait and file, the targets with their subject-match and pass, fail, na, and uncertain probabilities, plus any failures that prevented complete checking.
    |Targets the trait's subject does not cover are reported as Unmatched and not assessed.
    |Fix targets that likely fail and check again; treat probabilities as evidence, not guarantees.
    |If the check fails, follow the message, for example by running \`traits update\` to migrate an outdated workspace.
    `),
    String.trim
  ),
  parameters: S.Struct({
    /** Files to check, relative to the workspace root. */
    paths: S.NonEmptyArray(S.NonEmptyString).annotate({
      description: "Files to check, relative to the workspace root."
    }),
    /** An environment in .agents/traits/_environments whose traits to check; every trait when omitted. */
    environment: EnvironmentName.annotateKey({
      description: "An environment in .agents/traits/_environments whose traits to check; every trait when omitted."
    }).pipe(S.optionalKey),
    /** Traits to check, within the environment when one is given. */
    traits: S.NonEmptyArray(TraitName)
      .annotateKey({ description: "Traits to check, within the environment when one is given." })
      .pipe(S.optionalKey)
  }),
  success: Report,
  failure: TraitsCheckFailure,
  failureMode: "return"
})
  .annotate(Tool.Title, "Check Traits")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)

/** The traits.check toolkit. */
export const toolkit = Toolkit.make(TraitsCheck)

/** The traits.check handler, delegating to the shared workspace checker. */
export const layer = toolkit.toLayer(
  Effect.gen(function* () {
    const { check } = yield* WorkspaceCheck.WorkspaceCheck
    return {
      "traits.check": (parameters) =>
        check(parameters).pipe(Effect.mapError((error) => TraitsCheckFailure.make({ message: error.message })))
    }
  })
)
