import { Context, Effect, FileSystem, Layer } from "effect"

/** The canonical workspace directory that extension module paths are resolved against and imported from. */
export class WorkspaceRoot extends Context.Service<
  WorkspaceRoot,
  {
    /** The canonical absolute directory, with symlinks resolved to match resolver output. */
    readonly directory: string
  }
>()("traits/WorkspaceRoot") {
  /** Canonicalizes a host-selected workspace directory, so module paths match canonical resolver output. */
  static readonly layer = (directory: string) =>
    Layer.effect(
      this,
      FileSystem.FileSystem.pipe(
        Effect.flatMap((fs) => fs.realPath(directory)),
        Effect.map((directory) => ({ directory }))
      )
    )
}
