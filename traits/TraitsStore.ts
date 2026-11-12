import { type Effect, Schema as S } from "effect"

import { Trait } from "./Trait.ts"
import { TraitName } from "./TraitName.ts"

/** Reads and writes validated trait definitions within one configured store. */
export interface TraitsStore {
  /** Lists the names of all trait definitions in the store. */
  readonly list: () => Effect.Effect<ReadonlyArray<TraitName>, TraitsListError>
  /** Reads a trait definition by name; fails when it does not exist. */
  readonly read: (name: TraitName) => Effect.Effect<Trait, TraitReadError>
  /** Creates or replaces a trait definition, identified by its name. */
  readonly write: (trait: Trait) => Effect.Effect<void, TraitWriteError>
  /** Removes a trait definition by name; fails when it does not exist. */
  readonly remove: (name: TraitName) => Effect.Effect<void, TraitRemoveError>
}

/** A failure listing trait definitions in a store. */
export class TraitsListError extends S.TaggedError<TraitsListError>()("TraitsListError", {
  /** The underlying storage failure. */
  cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
}) {}

/** A failure reading a trait definition. */
export class TraitReadError extends S.TaggedError<TraitReadError>()("TraitReadError", {
  /** The name of the trait involved in the failed operation. */
  traitName: TraitName.annotateKey({ description: "The name of the trait involved in the failed operation." }),
  /** The underlying storage failure. */
  cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
}) {}

/** A failure creating or replacing a trait definition. */
export class TraitWriteError extends S.TaggedError<TraitWriteError>()("TraitWriteError", {
  /** The trait definition that could not be written. */
  trait: Trait.annotateKey({ description: "The trait definition that could not be written." }),
  /** The underlying storage failure. */
  cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
}) {}

/** A failure removing a trait definition. */
export class TraitRemoveError extends S.TaggedError<TraitRemoveError>()("TraitRemoveError", {
  /** The name of the trait involved in the failed operation. */
  traitName: TraitName.annotateKey({ description: "The name of the trait involved in the failed operation." }),
  /** The underlying storage failure. */
  cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
}) {}
