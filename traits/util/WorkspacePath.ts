import { Schema as S } from "effect"

/** A normalized workspace-relative POSIX path, portable across machines checking the same workspace. */
export type WorkspacePath = typeof WorkspacePath.Type
export const WorkspacePath = S.NonEmptyString.check(
  // No drive letter; no "." or ".." segment; nonempty "/"-separated segments without backslashes.
  S.isPattern(/^(?![A-Za-z]:)(?!(?:.*\/)?\.\.?(?:\/|$))[^\\/]+(?:\/[^\\/]+)*$/u, {
    message:
      "Expected a normalized workspace-relative POSIX path without empty, '.', or '..' segments, backslashes, or drive letters."
  })
)
  .pipe(S.brand("traits/WorkspacePath"))
  .annotate({
    description: "A normalized workspace-relative POSIX path, portable across machines checking the same workspace."
  })
