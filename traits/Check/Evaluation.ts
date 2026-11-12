import { Array, Deferred, Effect, Order, Result } from "effect"
import type { AiError, Decision } from "effect/ai"

import * as Enrichment from "../Enrichment/Enrichment.ts"
import * as Report from "../Report/Report.ts"
import * as TraitAssertion from "../TraitAssertion.ts"
import * as TraitSubject from "../TraitSubject.ts"
import { Input, Segment, targetText, TextDigest } from "../util/util.ts"
import type { CheckInput } from "./CheckInput.ts"
import type { Preparation } from "./Preparation.ts"

type DecisionResponse = TraitAssertion.TraitAssertionEvaluations<"assertion"> | TraitSubject.TraitSubjectMatches

/** The subject decision for one input when it completed; neither decision nor cancellation means it failed, for the reason in failure when known. */
interface SubjectGate {
  readonly responses: ReadonlyArray<DecisionResponse>
  readonly decision?: { readonly label: string; readonly probabilities: TraitSubject.TraitSubjectMatch } | undefined
  readonly failure?: string | undefined
  readonly cancelled?: boolean | undefined
}

/** Why a decision failed, from its error or unanswered reason only, so provider text and source never reach the report; undefined for defects. */
const failureReason = (failure: AiError.AiError | Decision.Unanswered | undefined): string | undefined => {
  if (failure === undefined) {
    return undefined
  }
  if (failure._tag === "Unanswered") {
    return `unanswered (${failure.reason})`
  }
  const kind = "kind" in failure.reason ? ` (${globalThis.String(failure.reason.kind)})` : ""
  return `${failure.reason._tag}${kind}${failure.isRetryable ? " after retries" : ""}`
}

/** A decision failure explanation naming the reason when known. */
const decisionFailed = (decision: string, reason: string | undefined) =>
  Report.Explanation.cases.Error.make({
    error:
      reason === undefined ? `${decision} failed or returned invalid probabilities.` : `${decision} failed: ${reason}.`
  })

/** One change's report and the subject and assertion decision responses received while producing it. */
interface ChangeResult {
  readonly report: Report.ChangeReport
  readonly responses: ReadonlyArray<DecisionResponse>
}

/** Sorted model identifiers and token totals across received responses, counting a response shared by batched decisions once; a total is omitted when any response did not report it. */
const provenance = (received: ReadonlyArray<DecisionResponse>) => {
  // Batched decisions share one response object, so deduplicate by identity rather than structural equality.
  const responses = globalThis.Array.from(new Set(received))
  const total = (key: "inputTokens" | "outputTokens") =>
    Array.every(responses, (response) => response.usage[key] !== undefined)
      ? { [key]: Array.reduce(responses, 0, (sum, response) => sum + response.usage[key]!) }
      : {}
  return {
    models: Array.sort(
      Array.dedupe(Array.flatMap(responses, (response) => (response.modelId === undefined ? [] : [response.modelId]))),
      Order.String
    ),
    usage: { ...total("inputTokens"), ...total("outputTokens") }
  }
}

/** Builds each trait's per-change results and run provenance; Deferreds only coordinate recovery. */
export const evaluate = Effect.fnUntraced(function* (request: CheckInput, preparation: Preparation) {
  // Decision requests are limited by Models.layerDecisionLimit, so the per-trait, per-change, and per-input fibers here stay cheap.
  const traits = yield* Effect.forEach(
    request.traits,
    Effect.fnUntraced(function* (entry) {
      const { trait } = entry
      const traitStopped = yield* Deferred.make<void>()
      const evaluateInput = Effect.fnUntraced(function* (input: Input) {
        const inputStopped = yield* Deferred.make<void>()
        const digest = yield* TextDigest.make(targetText(input))
        // Gate on the subject first, so enrichments and the assertion run only for targets the subject may cover.
        const gate =
          trait.subject === undefined
            ? undefined
            : yield* TraitSubject.decide(trait.subject, input).pipe(
                Effect.catchDefect(() => Effect.fail(undefined)),
                Effect.match({
                  onFailure: (error) => ({ responses: [], failure: failureReason(error) }),
                  onSuccess: (decided) =>
                    Result.isSuccess(decided.outcome)
                      ? { responses: [decided.response], decision: decided.outcome.success }
                      : { responses: [decided.response], failure: failureReason(decided.outcome.failure) }
                }),
                Effect.raceFirst(Deferred.await(traitStopped).pipe(Effect.as({ responses: [], cancelled: true }))),
                Effect.map((gate): SubjectGate => gate)
              )
        if (gate?.decision?.label === "no") {
          return {
            report: Report.InputReport.cases.Unmatched.make({
              segment: input.segment,
              digest,
              subject: gate.decision.probabilities
            }),
            responses: gate.responses
          }
        }
        const subjectFailed = gate !== undefined && gate.decision === undefined && gate.cancelled !== true
        if (subjectFailed) {
          yield* Deferred.succeed(inputStopped, undefined)
        }
        const enrichments = yield* Effect.forEach(
          trait.enrichments ?? [],
          Effect.fnUntraced(function* (module) {
            const cancelled = Report.EnrichmentOutcome.cases.Cancelled.make({ module })
            const failed = (explanation: Report.Explanation) =>
              Report.EnrichmentOutcome.cases.Failed.make({ module, explanation })
            const execute = preparation.enrichments.get(module)
            if (execute === undefined) {
              return Report.EnrichmentOutcome.cases.SetupFailed.make({ module })
            }
            if ((yield* Deferred.isDone(inputStopped)) || (yield* Deferred.isDone(traitStopped))) {
              return cancelled
            }
            const fallback = failed(Report.Explanation.cases.Error.make({ error: "Enrichment execution failed." }))
            return yield* execute.pipe(
              Effect.provideService(Enrichment.EnrichmentContext, { trait, input }),
              Effect.map((text): Report.EnrichmentOutcome =>
                Report.EnrichmentOutcome.cases.Succeeded.make({ module, text })
              ),
              (operation) =>
                Effect.raceAllFirst([
                  operation,
                  Deferred.await(inputStopped).pipe(Effect.as(cancelled)),
                  Deferred.await(traitStopped).pipe(Effect.as(cancelled))
                ]),
              // Handle recovery after the operation race, so its own stop signal cannot erase its explanation.
              Effect.catchTags({
                EnrichmentError: Effect.fnUntraced(function* (error) {
                  if (!Enrichment.EnrichmentErrorReason.guards.Enrichment(error.reason)) {
                    if (Enrichment.EnrichmentErrorReason.guards.Trait(error.reason)) {
                      yield* Deferred.succeed(traitStopped, undefined)
                    }
                    yield* Deferred.succeed(inputStopped, undefined)
                  }
                  return failed(Report.Explanation.cases.Instruction.make({ instruction: error.instruction }))
                }),
                SchemaError: () => Effect.succeed(fallback)
              }),
              Effect.catchDefect(() => Effect.succeed(fallback))
            )
          }),
          { concurrency: "unbounded" }
        )
        const fields = {
          segment: input.segment,
          digest,
          ...(gate?.decision === undefined ? {} : { subject: gate.decision.probabilities }),
          enrichments
        }
        const responses = gate?.responses ?? []
        if (subjectFailed) {
          return {
            report: Report.InputReport.cases.Failed.make({
              ...fields,
              explanation: decisionFailed("Subject decision", gate.failure)
            }),
            responses
          }
        }
        if (yield* Deferred.isDone(inputStopped)) {
          return { report: Report.InputReport.cases.Failed.make(fields), responses }
        }
        if (yield* Deferred.isDone(traitStopped)) {
          return { report: Report.InputReport.cases.Cancelled.make(fields), responses }
        }
        if (trait.assertion === undefined) {
          return { report: Report.InputReport.cases.Completed.make(fields), responses }
        }
        const assessmentFailed = (reason: string | undefined) =>
          Report.InputReport.cases.Failed.make({
            ...fields,
            explanation: decisionFailed("Assertion assessment", reason)
          })
        return yield* TraitAssertion.evaluate(
          {
            assertion: {
              assertion: trait.assertion,
              context: trait,
              enrichments: Array.filter(enrichments, Report.EnrichmentOutcome.guards.Succeeded)
            }
          },
          input
        ).pipe(
          Effect.catchDefect(() => Effect.fail(undefined)),
          Effect.match({
            onSuccess: (response) => {
              const outcome = response.outcomes.assertion
              return {
                report: Result.isSuccess(outcome)
                  ? Report.InputReport.cases.Completed.make({ ...fields, assessment: outcome.success.probabilities })
                  : assessmentFailed(failureReason(outcome.failure)),
                responses: [...responses, response]
              }
            },
            onFailure: (error) => ({ report: assessmentFailed(failureReason(error)), responses })
          }),
          Effect.raceFirst(
            Deferred.await(traitStopped).pipe(
              Effect.as({ report: Report.InputReport.cases.Cancelled.make(fields), responses })
            )
          )
        )
      })
      const changes = yield* Effect.forEach(
        request.changes,
        (supplied, index) => {
          const ignored = supplied.ignores?.[trait.name]
          if (ignored !== undefined) {
            return Effect.succeed<ChangeResult>({
              report: Report.ChangeReport.cases.Ignored.make({ reason: ignored }),
              responses: []
            })
          }
          const { change } = supplied
          const inputs =
            trait.segment === undefined
              ? // Without a segmenter, the whole after source, or the before source of a deletion, is one input.
                Result.succeed([
                  change.after === undefined
                    ? Input.cases.Before.make({
                        change: { before: change.before! },
                        segment: Segment.cases.Before.make({ range: { start: 0, end: change.before!.text.length } })
                      })
                    : Input.cases.After.make({
                        change: { ...change, after: change.after },
                        segment: Segment.cases.After.make({ range: { start: 0, end: change.after.text.length } })
                      })
                ])
              : // Missing results mean the segmenter's setup failed, so it never ran for any change.
                (preparation.segmentations.get(trait.segment)?.[index] ?? Result.fail(undefined))
          return Result.isFailure(inputs)
            ? Effect.succeed<ChangeResult>({ report: Report.ChangeReport.cases.NotSegmented.make({}), responses: [] })
            : Effect.forEach(inputs.success, evaluateInput, { concurrency: "unbounded" }).pipe(
                Effect.map((results): ChangeResult => ({
                  report: Report.ChangeReport.cases.Evaluated.make({
                    inputs: Array.map(results, (result) => result.report)
                  }),
                  responses: Array.flatMap(results, (result) => result.responses)
                }))
              )
        },
        { concurrency: "unbounded" }
      )
      return {
        report: Report.TraitReport.make({
          trait,
          ...(entry.origin === undefined ? {} : { origin: entry.origin }),
          changes: Array.map(changes, (change) => change.report)
        }),
        responses: Array.flatMap(changes, (change) => change.responses)
      }
    }),
    { concurrency: "unbounded" }
  )
  return {
    traits: Array.map(traits, (trait) => trait.report),
    ...provenance(Array.flatMap(traits, (trait) => trait.responses))
  }
})
