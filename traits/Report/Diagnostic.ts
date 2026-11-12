import { Schema as S } from "effect"

import { DiagnosticOrigin } from "./DiagnosticOrigin.ts"
import { Explanation } from "./Explanation.ts"

/** A shared extension failure affecting every trait or input that depends on it; failures local to one input are recorded on that input instead. */
export type Diagnostic = typeof Diagnostic.Type
export const Diagnostic = S.Struct({
  origin: DiagnosticOrigin,
  explanation: Explanation
}).annotate({
  description:
    "A shared extension failure affecting every trait or input that depends on it; failures local to one input are recorded on that input instead."
})
