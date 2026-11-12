import { Effect, Option, Schema as S, String } from "effect"
import { McpSchema, McpServer } from "effect/ai"

export type Approval = typeof Approval.Type
export const Approval = S.TaggedUnion({
  Approved: {},
  ApprovalRequired: { message: S.String },
  RevisionRequired: { feedback: S.String },
  Declined: {}
})

export const request = Effect.fn("Approval.request")(function* (options: {
  readonly message: string
  readonly approved?: boolean | undefined
}) {
  const client = yield* Effect.serviceOption(McpSchema.McpServerClient).pipe(Effect.map(Option.getOrUndefined))
  const supportsForm =
    client !== undefined &&
    client.clientCapabilities.elicitation !== undefined &&
    (client.clientCapabilities.elicitation.form !== undefined ||
      client.clientCapabilities.elicitation.url === undefined)
  const globalForms =
    client !== undefined &&
    (String.toLowerCase(client.clientInfo.name) === "opencode" ||
      typeof client.requestMetadata?.["ai.opencode/sessionID"] === "string")

  if (client === undefined || !supportsForm || globalForms) {
    return options.approved === true
      ? Approval.cases.Approved.make({})
      : Approval.cases.ApprovalRequired.make({ message: options.message })
  }

  const response = yield* McpServer.elicit({
    message: options.message,
    schema: S.Struct({
      decision: S.Literals(["approve", "revise", "skip"]).annotate({
        description: "Approve this exact proposal, request a revision, or skip it."
      }),
      feedback: S.String.pipe(S.optionalKey).annotate({ description: "Optional revision or alternative wording." })
    })
  }).pipe(
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.catchTags({
      ElicitationDeclined: (error) => (error.cause === undefined ? Effect.undefined : error)
    })
  )
  if (response === undefined || response.decision === "skip") return Approval.cases.Declined.make({})
  if (response.decision === "revise" || (response.feedback !== undefined && String.trim(response.feedback) !== "")) {
    const feedback = response.feedback === undefined ? "" : String.trim(response.feedback)
    const guidance = String.stripMargin(`
    | Ask the user for revision details using an interactive question with free-text input.
    | Keep this proposal pending; do not infer approval or cancel it because of a related follow-up task.
    `)
    return Approval.cases.RevisionRequired.make({
      feedback: feedback !== "" ? feedback : guidance
    })
  }
  return Approval.cases.Approved.make({})
})
