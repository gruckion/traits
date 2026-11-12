import { Schema as S } from "effect"

import { TraitAssertion } from "./TraitAssertion.ts"
import { TraitBody } from "./TraitBody.ts"
import { TraitName } from "./TraitName.ts"
import { TraitPurpose } from "./TraitPurpose.ts"
import { TraitSubject } from "./TraitSubject.ts"
import { WorkspacePath } from "./util/util.ts"

/** A static trait definition with optional subject, segmentation, assertion, supporting body, and enrichments. */
export type Trait = typeof Trait.Type
export const Trait = S.Struct({
  /** A descriptive kebab-case trait name without a redundant trait- prefix. */
  name: TraitName,
  /** The kind of artifact, action, transaction, relationship, or situation to identify and assess. */
  subject: TraitSubject.pipe(S.optionalKey),
  /** The assertion to assess; omitted for guidance-only traits that produce no assertion assessment. */
  assertion: TraitAssertion.annotateKey({
    description: "The assertion to assess; omitted for guidance-only traits that produce no assertion assessment."
  }).pipe(S.optionalKey),
  /** What the trait aims to achieve or protect, and why that matters. */
  purpose: TraitPurpose,
  /** The host-resolved, workspace-relative path of a module selecting assessment segments from each change. */
  segment: WorkspacePath.annotateKey({
    description:
      "The host-resolved, workspace-relative path of a module selecting assessment segments from each change."
  }).pipe(S.optionalKey),
  /** Ordered, distinct host-resolved, workspace-relative module paths supplying input-specific context; omitted when none are configured. */
  enrichments: S.NonEmptyArray(WorkspacePath)
    .check(S.isMaxLength(32), S.isUnique())
    .annotateKey({
      description:
        "Ordered, distinct host-resolved, workspace-relative module paths supplying input-specific context; omitted when none are configured."
    })
    .pipe(S.optionalKey),
  /** Shared supporting context from the trait's Markdown body; enrichments do not modify it. */
  body: TraitBody.annotateKey({
    description: "Shared supporting context from the trait's Markdown body; enrichments do not modify it."
  }).pipe(S.optionalKey)
}).annotate({
  description:
    "A static trait definition with optional subject, segmentation, assertion, supporting body, and enrichments."
})
