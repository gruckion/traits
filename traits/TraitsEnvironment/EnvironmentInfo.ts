import { Schema as S } from "effect"

/** An environment's storage kind and write capability. */
export type EnvironmentInfo = typeof EnvironmentInfo.Type
export const EnvironmentInfo = S.TaggedUnion({
  /** Local environments always support writes. */
  Local: {},
  Git: {
    /** Whether the remote Git environment supports writes. */
    writable: S.Boolean.annotateKey({
      description: "Whether the remote Git environment supports writes."
    })
  }
}).annotate({
  description: "An environment's storage kind and write capability."
})
