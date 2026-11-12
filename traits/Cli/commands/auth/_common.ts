import { Command } from "effect/cli"

/** Describes an auth command as experimental: its flags, output, and credential storage may change without notice. */
export const withExperimentalDescription = (description: string) =>
  Command.withDescription(`(experimental) ${description}`)
