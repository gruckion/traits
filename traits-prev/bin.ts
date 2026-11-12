#!/usr/bin/env node
// traits-ignore-file effect-utilities-with-native-behavior-exceptions: Effect utilities are unavailable until this launcher installs dependencies.
// traits-ignore-file effect-platform-services: Native Node APIs must install project dependencies before Effect platform services are available.
// traits-ignore-file effect-based-exception-handling: Dependency installation must finish before Effect error-handling APIs are available.
/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- Effect is unavailable until this launcher installs dependencies. */
import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const candidates = [
  ["pnpm", ["pnpm-lock.yaml"]],
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
  ["yarn", ["yarn.lock"]],
  ["bun", ["bun.lock", "bun.lockb"]]
] as const

const installCommand = (root: string): [string, string[]] => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const declared =
    typeof manifest === "object" && manifest !== null && "packageManager" in manifest
      ? manifest.packageManager
      : undefined
  const matches = candidates.filter((candidate) => candidate[1].some((file) => existsSync(join(root, file))))
  const manager =
    typeof declared === "string" ? declared.split("@")[0] : matches.length === 1 ? matches[0]?.[0] : undefined
  if (manager === undefined || !candidates.some((candidate) => candidate[0] === manager)) {
    throw new Error("Set package.json#packageManager to pnpm, npm, yarn, or bun to select the installer")
  }
  const locked =
    candidates.find((candidate) => candidate[0] === manager)?.[1].some((file) => existsSync(join(root, file))) ?? false
  if (manager === "npm") return [manager, [locked ? "ci" : "install"]]
  if (manager === "yarn") {
    const modern =
      typeof declared === "string"
        ? !declared.startsWith("yarn@1.")
        : /^__metadata:/m.test(readFileSync(join(root, "yarn.lock"), "utf8"))
    return [manager, ["install", ...(locked ? [modern ? "--immutable" : "--frozen-lockfile"] : [])]]
  }
  return [manager, ["install", ...(locked ? ["--frozen-lockfile"] : [])]]
}

const install = (command: string, args: string[]) => {
  // Windows package-manager shims are .cmd files, which Node cannot spawn directly.
  const child = spawn(
    process.platform === "win32" ? "cmd.exe" : command,
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args,
    { stdio: ["ignore", process.stderr, process.stderr] }
  )
  const interrupt = () => {
    child.kill("SIGINT")
  }
  const terminate = () => {
    child.kill("SIGTERM")
  }
  const hangup = () => {
    child.kill("SIGHUP")
  }
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", terminate)
  process.on("SIGHUP", hangup)
  return once(child, "close")
    .then((result) => {
      if (result[0] !== 0) throw new Error(`${command} exited with ${result[1] ?? result[0]}`)
    })
    .finally(() => {
      process.off("SIGINT", interrupt)
      process.off("SIGTERM", terminate)
      process.off("SIGHUP", hangup)
    })
}

const args = process.argv.slice(2)
const delimiter = args.indexOf("--")
const options = delimiter === -1 ? args : args.slice(0, delimiter)
const utility = options.some((arg) => ["run", "reflection"].includes(arg))
const informational = options.some((arg) =>
  ["--help", "-h", "--version", "-v", "--completions"].some((flag) => arg === flag || arg.startsWith(`${flag}=`))
)
if (!utility && !informational) {
  const [command, installArgs] = installCommand(process.cwd())
  process.stderr.write(`[traits] Installing dependencies in ${process.cwd()} using ${command}\n`)
  await install(command, installArgs)
}
await import("./main.ts")
