import { Schema as S } from "effect"

import { Verdict } from "./Verdict.ts"

/** Verdicts derived from a report and policy, aligned with Report.traits, their changes, and their inputs; not stored in the report. */
export type ReportVerdicts = typeof ReportVerdicts.Type
export const ReportVerdicts = S.Struct({
  /** Combined verdict for the whole report, including shared diagnostics. */
  verdict: Verdict.annotateKey({ description: "Combined verdict for the whole report, including shared diagnostics." }),
  /** Per-trait verdicts aligned with Report.traits. */
  traits: S.Array(
    S.Struct({
      /** Combined verdict for the trait across its non-ignored changes. */
      verdict: Verdict.annotateKey({ description: "Combined verdict for the trait across its non-ignored changes." }),
      /** Per-change verdicts aligned with the trait report's changes. */
      changes: S.Array(
        S.Struct({
          /** Combined verdict for the change; omitted when the change is ignored. */
          verdict: Verdict.annotateKey({
            description: "Combined verdict for the change; omitted when the change is ignored."
          }).pipe(S.optionalKey),
          /** Per-input verdicts aligned with the change's evaluated inputs; empty unless evaluated. */
          inputs: S.Array(Verdict).annotate({
            description: "Per-input verdicts aligned with the change's evaluated inputs; empty unless evaluated."
          })
        })
      ).annotate({ description: "Per-change verdicts aligned with the trait report's changes." })
    })
  ).annotate({ description: "Per-trait verdicts aligned with Report.traits." })
}).annotate({
  description:
    "Verdicts derived from a report and policy, aligned with Report.traits, their changes, and their inputs; not stored in the report."
})
