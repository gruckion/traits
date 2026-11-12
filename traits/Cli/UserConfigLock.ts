/**
 * Mutual exclusion for local CLI configuration and credential updates.
 * The one-minute timeout covers lock setup and acquisition, not semaphore queueing or operation time.
 * Not reentrant; no rollback. Nonblocking attempts keep waiting interruptible.
 * Effect FileSystem does not expose the native descriptor required by the locking API.
 * Never unlink or replace the persistent lock file; closing its handle releases the lock.
 * Native modules are loaded on first lock use and memoized per service instance.
 * The exported withLock helper resolves the current service for pipeable use.
 * UserConfigLockSetupError reports native-module setup failures.
 * Lock-use errors distinguish storage, identity, legacy markers, native acquisition, and timeout.
 * Protected operation errors propagate unchanged.
 */
import { Context, Duration, Effect, FileSystem, Layer, Option, Schedule, Schema as S, Scope, Semaphore } from "effect"

import { CliPaths } from "./CliPaths.ts"
import { UserFileSecurity } from "./UserFileSecurity.ts"

export class UserConfigLockSetupError extends S.TaggedError<UserConfigLockSetupError>()("UserConfigLockSetupError", {
  /** Native module whose lazy import failed. */
  module: S.String.annotateKey({ description: "Native module whose lazy import failed." }),
  /** Original native-module import failure. */
  cause: S.Defect().annotateKey({ description: "Original native-module import failure." })
}) {
  override get message() {
    return `Failed to load ${this.module} for user configuration locking.`
  }
}

export class UserConfigLockStorageError extends S.TaggedError<UserConfigLockStorageError>()(
  "UserConfigLockStorageError",
  {
    /** Lock-storage path affected by this failure. */
    path: S.String.annotateKey({ description: "Lock-storage path affected by this failure." }),
    /** Underlying filesystem or file-security failure. */
    cause: S.Defect().annotateKey({ description: "Underlying filesystem or file-security failure." })
  }
) {
  override get message() {
    return `Failed to prepare or inspect user configuration lock storage at ${this.path}. Check ownership, permissions, and available disk space.`
  }
}

export class UserConfigLockIdentityError extends S.TaggedError<UserConfigLockIdentityError>()(
  "UserConfigLockIdentityError",
  {
    /** Secured lock path that no longer matches the open file handle. */
    path: S.String.annotateKey({ description: "Secured lock path that no longer matches the open file handle." })
  }
) {
  override get message() {
    return `The open lock file no longer matches the secured path at ${this.path}.`
  }
}

export class UserConfigLockLegacyError extends S.TaggedError<UserConfigLockLegacyError>()("UserConfigLockLegacyError", {
  /** Lock-file path containing an incompatible legacy marker. */
  path: S.String.annotateKey({ description: "Lock-file path containing an incompatible legacy marker." })
}) {
  override get message() {
    return `The lock file at ${this.path} contains a legacy lock marker. Stop all older CLI processes before removing that marker and retrying; their locks are not compatible with kernel locking.`
  }
}

export class UserConfigLockAcquireError extends S.TaggedError<UserConfigLockAcquireError>()(
  "UserConfigLockAcquireError",
  {
    /** Lock-file path whose native acquisition failed. */
    path: S.String.annotateKey({ description: "Lock-file path whose native acquisition failed." }),
    /** Original native-lock failure; ordinary contention is retried instead. */
    cause: S.Defect().annotateKey({
      description: "Original native-lock failure; ordinary contention is retried instead."
    })
  }
) {
  override get message() {
    return `Native lock acquisition failed at ${this.path}.`
  }
}

export class UserConfigLockTimeoutError extends S.TaggedError<UserConfigLockTimeoutError>()(
  "UserConfigLockTimeoutError",
  {
    /** Lock-file path whose setup or acquisition exceeded one minute. */
    path: S.String.annotateKey({ description: "Lock-file path whose setup or acquisition exceeded one minute." })
  }
) {
  override get message() {
    return `Timed out after one minute waiting for the user configuration lock at ${this.path}. Another operation may still hold it; do not delete the lock file.`
  }
}

export class UserConfigLock extends Context.Service<UserConfigLock>()("traits/Cli/UserConfigLock", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const { dataDirectory, lock } = yield* CliPaths
    const secure = yield* UserFileSecurity
    const semaphore = yield* Semaphore.make(1)
    const modules = yield* Effect.all(
      [
        Effect.tryPromise({
          try: () => import("fs-native-extensions"),
          catch: (cause) => UserConfigLockSetupError.make({ module: "fs-native-extensions", cause })
        }),
        Effect.tryPromise({
          try: () => import("node:fs/promises"),
          catch: (cause) => UserConfigLockSetupError.make({ module: "node:fs/promises", cause })
        })
      ],
      { concurrency: "unbounded" }
    ).pipe(Effect.cached)
    return <A, E, R>(operation: Effect.Effect<A, E, R>) =>
      Effect.scopedWith((scope) =>
        Effect.gen(function* () {
          const [{ tryLock }, { constants, open }] = yield* modules
          yield* fs.makeDirectory(dataDirectory, { recursive: true, mode: 0o700 })
          yield* secure(dataDirectory, "Directory")
          yield* secure(lock, "File").pipe(
            Effect.catchTags({
              PlatformError: (cause) => (cause.reason._tag === "NotFound" ? Effect.void : cause)
            })
          )
          const file = yield* Effect.tryPromise({
            try: () => open(lock, constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0), 0o600),
            catch: (cause) =>
              UserConfigLockStorageError.make({
                path: lock,
                cause
              })
          }).pipe((acquire) =>
            Effect.acquireRelease(acquire, (file) => Effect.promise(() => file.close()).pipe(Effect.orDie))
          )
          yield* secure(lock, "File")
          const info = yield* Effect.tryPromise({
            try: () => file.stat({ bigint: true }),
            catch: (cause) => UserConfigLockStorageError.make({ path: lock, cause })
          })
          yield* fs.lstat(lock).pipe(
            Effect.filterOrFail(
              (current) => info.isFile() && current.dev === info.dev && Option.getOrUndefined(current.ino) === info.ino,
              () => UserConfigLockIdentityError.make({ path: lock })
            ),
            Effect.filterOrFail(
              () => info.size === 0n,
              () => UserConfigLockLegacyError.make({ path: lock })
            )
          )
          yield* Effect.try({
            try: () => tryLock(file.fd),
            catch: (cause) => UserConfigLockAcquireError.make({ path: lock, cause })
          }).pipe(Effect.repeat({ until: (granted) => granted, schedule: Schedule.spaced("50 millis") }))
        }).pipe(
          Scope.provide(scope),
          Effect.catchTags({
            UserFileSecurityError: (cause) => UserConfigLockStorageError.make({ path: cause.path, cause }),
            PlatformError: (cause) =>
              UserConfigLockStorageError.make({
                path: lock,
                cause
              })
          }),
          Effect.timeoutOrElse({
            duration: Duration.minutes(1),
            orElse: () => UserConfigLockTimeoutError.make({ path: lock })
          }),
          Effect.andThen(operation)
        )
      ).pipe(semaphore.withPermit, Effect.withSpan("UserConfigLock.withLock"))
  })
}) {
  static readonly layer = this.make.pipe(Layer.effect(UserConfigLock))
}

export const withLock = <A, E, R>(operation: Effect.Effect<A, E, R>) => UserConfigLock.use((lock) => lock(operation))
