import { Schema as S } from "effect"

import { ModelSelection } from "./ModelSelection.ts"

/** User-level model selections by role, using saved provider accounts or custom layer modules; contains no credentials. */
export type Profile = typeof Profile.Type
export const Profile = S.Struct({
  language: ModelSelection,
  decision: ModelSelection
}).annotate({
  description:
    "User-level model selections by role, using saved provider accounts or custom layer modules; contains no credentials."
})

export * from "./ModelSelection.ts"
export * from "./ProfileName.ts"
