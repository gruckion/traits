import { type Effect, Schema as S } from "effect"

import { TraitsEnvironment } from "./TraitsEnvironment.ts"

/** Reads and writes authored environments within one configured store; does not synthesize default or resolve extends. */
export interface TraitsEnvironmentStore {
  /** Lists authored environment names, excluding the implicit default environment. */
  readonly list: () => Effect.Effect<ReadonlyArray<string>, TraitsEnvironmentListError>
  /** Reads an authored environment by name; fails when it does not exist. */
  readonly read: (name: string) => Effect.Effect<TraitsEnvironment, TraitsEnvironmentReadError>
  /** Creates or replaces an authored environment; the implicit default name is reserved. */
  readonly write: (name: string, environment: TraitsEnvironment) => Effect.Effect<void, TraitsEnvironmentWriteError>
  /** Removes an authored environment; fails when it does not exist or the name is default. */
  readonly remove: (name: string) => Effect.Effect<void, TraitsEnvironmentRemoveError>
}

/** A failure listing authored environments in a store. */
export class TraitsEnvironmentListError extends S.TaggedError<TraitsEnvironmentListError>()(
  "TraitsEnvironmentListError",
  {
    /** The underlying storage failure. */
    cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
  }
) {}

/** A failure reading an authored environment. */
export class TraitsEnvironmentReadError extends S.TaggedError<TraitsEnvironmentReadError>()(
  "TraitsEnvironmentReadError",
  {
    /** The name of the environment involved in the failed operation. */
    environmentName: S.NonEmptyString.check(S.isTrimmed()).annotateKey({
      description: "The name of the environment involved in the failed operation."
    }),
    /** The underlying storage failure. */
    cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
  }
) {}

/** A failure creating or replacing an authored environment. */
export class TraitsEnvironmentWriteError extends S.TaggedError<TraitsEnvironmentWriteError>()(
  "TraitsEnvironmentWriteError",
  {
    /** The name of the environment involved in the failed operation. */
    environmentName: S.NonEmptyString.check(S.isTrimmed()).annotateKey({
      description: "The name of the environment involved in the failed operation."
    }),
    /** The environment definition that could not be written. */
    // Suspended because TraitsEnvironment.ts re-exports this module, so the schema may not be initialized yet at load time.
    environment: S.suspend(() => TraitsEnvironment).annotateKey({
      description: "The environment definition that could not be written."
    }),
    /** The underlying storage failure. */
    cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
  }
) {}

/** A failure removing an authored environment. */
export class TraitsEnvironmentRemoveError extends S.TaggedError<TraitsEnvironmentRemoveError>()(
  "TraitsEnvironmentRemoveError",
  {
    /** The name of the environment involved in the failed operation. */
    environmentName: S.NonEmptyString.check(S.isTrimmed()).annotateKey({
      description: "The name of the environment involved in the failed operation."
    }),
    /** The underlying storage failure. */
    cause: S.Defect().annotateKey({ description: "The underlying storage failure." })
  }
) {}
