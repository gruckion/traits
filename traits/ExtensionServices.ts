import { type Context, DateTime, FileSystem, Path, type Scope } from "effect"
import { type Chat, DecisionModel, LanguageModel } from "effect/ai"
import { Digest, SecureRandom } from "effect/crypto"
import { HttpClient } from "effect/http"
import { KeyValueStore } from "effect/persistence"
import { ChildProcessSpawner } from "effect/process"

/** Services the host provides once to every extension; registries capture exactly these from the host context. */
export const HostServices = [
  LanguageModel.LanguageModel,
  DecisionModel.DecisionModel,
  DateTime.CurrentTimeZone,
  KeyValueStore.KeyValueStore,
  Digest.Digest,
  SecureRandom.SecureRandom,
  HttpClient.HttpClient,
  FileSystem.FileSystem,
  Path.Path,
  ChildProcessSpawner.ChildProcessSpawner
] as const

/** Services the host provides once to every extension. */
export type HostServices = Context.Service.Identifier<(typeof HostServices)[number]>

/**
 * Services available during trait extension setup and execution: host services plus a chat and scope
 * the registry creates for each execution. Setup is shared per extension across the program lifecycle;
 * its scope outlives dependent executions until shutdown or explicit reset.
 */
export type ExtensionServices = HostServices | Chat.Chat | Scope.Scope
