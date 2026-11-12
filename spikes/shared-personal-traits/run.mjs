// THROWAWAY executable experiment: node spikes/shared-personal-traits/run.mjs
// Uses genuine Traits storage/tools and HTTP MCP, with deterministic fixture models.
/* oxlint-disable effecttsgo/async-function, effecttsgo/global-console, effecttsgo/global-fetch, effecttsgo/global-timers, effecttsgo/new-promise, effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string, effecttsgo/strict-boolean-expressions -- Independent protocol experiment deliberately uses native Node/fetch rather than the server runtime under examination. */
import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { mkdtemp, mkdir, writeFile, readFile, realpath, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join, dirname } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const scratch = await realpath(await mkdtemp(join(tmpdir(), "traits-personal-SPIKE-")))
const work = join(scratch, "work")
const home = join(scratch, "personal-tooling")
const repo = join(work, "monorepo")
const tree = join(work, "monorepo-task-a")
const later = join(work, "monorepo-task-b")
const technician = join(work, "technician")
const children = []
const results = []
const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const observe = (name, detail) => {
  results.push({ name, detail })
  console.log(`PASS ${name}: ${detail}`)
}
const rejected = (result, pattern) => {
  assert.ok(result.error || result.isError === true, JSON.stringify(result))
  assert.match(JSON.stringify(result), pattern)
}
const launch = (entry, args = [], env = {}) => {
  const child = spawn(process.execPath, [entry, ...args], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  })
  children.push(child)
  child.diagnostic = ""
  child.output = ""
  child.stderr.on("data", (chunk) => (child.diagnostic += chunk))
  child.stdout.on("data", (chunk) => (child.output += chunk))
  return child
}
const firstLine = (child) =>
  new Promise((yes, no) => {
    const reader = createInterface({ input: child.stdout })
    const timer = setTimeout(() => no(new Error(`Startup timed out: ${child.diagnostic}`)), 20000)
    reader.once("line", (line) => {
      clearTimeout(timer)
      reader.close()
      yes(line)
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      no(new Error(`Startup exited ${code}: ${child.diagnostic}`))
    })
  })

function connect(url, name, token) {
  let id = 0
  let session
  const request = async (method, params = {}, notification = false) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        ...(session ? { "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" } : {})
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: ++id }), method, params }),
      signal: AbortSignal.timeout(15000)
    })
    session = response.headers.get("mcp-session-id") ?? session
    const text = await response.text()
    if (!text) return undefined
    const body = response.headers.get("content-type")?.includes("text/event-stream")
      ? JSON.parse(
          text
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .at(-1)
            .slice(6)
        )
      : JSON.parse(text)
    return body
  }
  return {
    async init() {
      const response = await request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name, version: "spike" }
      })
      assert.equal(response.result.serverInfo.name, "traits-shared-PROTOTYPE")
      await request("notifications/initialized", {}, true)
    },
    request,
    async tool(name, args) {
      const response = await request("tools/call", { name, arguments: args })
      if (response.error) return { error: response.error }
      const result = response.result
      return { isError: result.isError, data: result.structuredContent ?? JSON.parse(result.content[0].text) }
    }
  }
}

try {
  await mkdir(join(home, "traits"), { recursive: true })
  await mkdir(repo, { recursive: true })
  git(repo, "init", "--quiet")
  await writeFile(join(repo, ".gitignore"), "ignored.ts\ntracked-ignored.ts\n.env*\n")
  await writeFile(join(repo, "input.ts"), "let marker = 'MAIN'\n")
  await writeFile(join(repo, "tracked-ignored.ts"), "let tracked = 'TRACKED'\n")
  git(repo, "add", ".")
  git(repo, "add", "-f", "tracked-ignored.ts")
  git(
    repo,
    "-c",
    "user.name=Traits Spike",
    "-c",
    "user.email=spike@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture"
  )
  git(repo, "worktree", "add", "--quiet", "-b", "task-a", tree)
  await writeFile(join(tree, "input.ts"), "let marker = 'WORKTREE-A'\n")
  await mkdir(technician)
  git(technician, "init", "--quiet")
  await writeFile(join(technician, "input.ts"), "let marker = 'TECHNICIAN'\n")
  await writeFile(
    join(home, "traits", "prefer-const.md"),
    "---\nname: prefer-const\nsubject: TypeScript bindings.\nrequirement: Prefer const unless reassignment is necessary.\npurpose: Communicate immutability.\n---\n"
  )

  const holderScript = resolve(here, "../../traits/test/fixtures/holdProjectLock.ts")
  const holder = launch(holderScript, [join(home, "traits")])
  assert.equal(await firstLine(holder), "ready")
  const contender = launch(holderScript, [join(home, "traits")])
  const [exit] = await once(contender, "close")
  assert.notEqual(exit, 0)
  assert.match(contender.diagnostic + contender.output, /already owns/)
  holder.kill("SIGTERM")
  await once(holder, "exit")
  observe("upstream baseline", "two independent servers cannot own the same trait directory")

  const token = "fixture-token-long-enough-for-authenticated-mcp"
  const tokenFile = join(home, "mcp-token")
  await writeFile(tokenFile, token, { mode: 0o600 })
  const host = launch(join(here, "server.mjs"), [], {
    SPIKE_TRAITS_HOME: home,
    SPIKE_WORK_FOLDER: work,
    SPIKE_PROVIDER_MODE: "fixture",
    TRAITS_MCP_TOKEN_FILE: tokenFile
  })
  const { url } = JSON.parse(await firstLine(host))
  for (const authorization of [undefined, "Bearer incorrect"]) {
    const denied = await fetch(url, {
      method: "POST",
      headers: authorization === undefined ? {} : { Authorization: authorization }
    })
    assert.equal(denied.status, 401)
  }
  observe("HTTP authentication", "missing or incorrect bearer credentials are rejected before MCP initialization")
  const a = connect(url, "codex-fixture", token)
  const b = connect(url, "claude-code-fixture", token)
  const c = connect(url, "t3-fixture", token)
  await Promise.all([a.init(), b.init(), c.init()])
  for (const client of [a, b, c]) {
    const listed = await client.request("tools/list")
    assert.deepEqual(listed.result.tools.map((tool) => tool.name).sort(), ["check_traits", "derive_trait"])
  }
  observe("shared HTTP sessions", "three independent MCP clients connect to one unchanged trait collection")

  const assertSnapshot = async (client, directory) => {
    const file = join(directory, "input.ts")
    const result = await client.tool("check_traits", { include: [file] })
    assert.equal(result.isError, false, JSON.stringify(result))
    assert.deepEqual(
      result.data.traits.map((trait) => trait.name),
      ["prefer-const"]
    )
    assert.equal(result.data.files[0].path, file)
    const contents = await readFile(file, "utf8")
    assert.equal(result.data.files[0].chunks[0].text, contents)
    assert.equal(result.data.files[0].revision, `sha256:${createHash("sha256").update(contents).digest("hex")}`)
    return result
  }
  await Promise.all([assertSnapshot(a, repo), assertSnapshot(b, tree), assertSnapshot(c, technician)])
  observe(
    "concurrent source selection",
    "main checkout, worktree and separate repo return their own unsaved content and SHA-256 snapshot"
  )

  git(repo, "worktree", "add", "--quiet", "-b", "task-b", later)
  await writeFile(join(later, "input.ts"), "let marker = 'NEW-WORKTREE-B'\n")
  await assertSnapshot(b, later)
  observe("new worktree", "a worktree created after server startup works with no Traits files or configuration")

  await writeFile(join(tree, "ignored.ts"), "let ignored = 'NEVER SEND'\n")
  const ignored = await a.tool("check_traits", { include: [join(tree, "ignored.ts")] })
  rejected(ignored, /ignored/)
  const tracked = await a.tool("check_traits", { include: [join(tree, "tracked-ignored.ts")] })
  assert.equal(tracked.isError, false)
  assert.equal(tracked.data.files.length, 1)
  await writeFile(join(tree, "new-untracked.ts"), "let untracked = 'NEW'\n")
  const untracked = await b.tool("check_traits", { include: [join(tree, "new-untracked.ts")] })
  assert.equal(untracked.isError, false)
  assert.equal(untracked.data.files.length, 1)
  observe("Git filtering", "ignored files rejected; tracked-but-ignored and new untracked source files remain eligible")

  const outside = join(scratch, "outside.ts")
  await writeFile(outside, "let outside = true\n")
  await symlink(outside, join(tree, "escape.ts"))
  for (const file of [outside, join(tree, "escape.ts")]) {
    const result = await a.tool("check_traits", { include: [file] })
    rejected(result, /outside/)
  }
  await writeFile(join(tree, ".env"), "FIXTURE_ONLY=not-a-secret\n")
  const env = await c.tool("check_traits", { include: [join(tree, ".env")] })
  rejected(env, /Credential/)
  const relative = await a.tool("check_traits", { include: ["input.ts"] })
  rejected(relative, /absolute/)
  await writeFile(join(tree, "literal[ab].ts"), "let literal = 'SELECTED LITERAL'\n")
  await writeFile(join(tree, "literala.ts"), "let other = 'UNSELECTED MATCH'\n")
  const glob = await a.tool("check_traits", { include: [join(tree, "literal[ab].ts")] })
  rejected(glob, /glob/)
  observe(
    "file boundaries",
    "outside paths, escaping symlinks, .env, relative paths and literal filenames with glob syntax are rejected"
  )

  const proposal = {
    name: "fixture-second-rule",
    subject: "Fixture code.",
    requirement: "Keep this synthetic rule.",
    purpose: "Exercise approval and persistence."
  }
  const pending = await a.tool("derive_trait", { proposedTrait: proposal })
  assert.equal(pending.data._tag, "ApprovalRequired", JSON.stringify(pending))
  assert.equal((await readdir(join(home, "traits"))).includes(`${proposal.name}.md`), false)
  const saved = await a.tool("derive_trait", { proposedTrait: proposal, approved: true })
  assert.equal(saved.data._tag, "Created", JSON.stringify(saved))
  await new Promise((yes) => setTimeout(yes, 250))
  const otherClient = await c.tool("check_traits", { include: [join(later, "input.ts")] })
  assert.equal(otherClient.isError, false)
  assert.deepEqual(otherClient.data.traits.map((trait) => trait.name).sort(), ["fixture-second-rule", "prefer-const"])
  observe(
    "shared approval and persistence",
    "unapproved fixture trait is absent; approved save is immediately visible to another client"
  )

  const competing = { ...proposal, name: "fixture-competing-rule" }
  const different = { ...competing, requirement: "A different exact proposal." }
  await a.tool("derive_trait", { proposedTrait: competing })
  await b.tool("derive_trait", { proposedTrait: different })
  const stale = await a.tool("derive_trait", { proposedTrait: competing, approved: true })
  assert.equal(stale.data._tag, "ApprovalRequired", JSON.stringify(stale))
  assert.equal((await readdir(join(home, "traits"))).includes(`${competing.name}.md`), false)
  observe(
    "competing proposals",
    "one client's different proposal cannot turn another client's approval into an unintended save"
  )

  for (const directory of [repo, tree, later, technician]) {
    assert.equal((await readdir(directory)).includes(".agents"), false)
    assert.equal((await readdir(directory)).includes("traits.ts"), false)
  }
  observe("checkout footprint", "no traits.ts, .agents directory, dependencies or setup files in any fixture checkout")

  await writeFile(
    join(here, "results.json"),
    JSON.stringify(
      {
        upstreamBase: git(resolve(here, "../.."), "merge-base", "origin/main", "HEAD"),
        fixtureModels: true,
        realAgentAppsTested: false,
        scenarios: results
      },
      null,
      2
    ) + "\n"
  )
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
      await Promise.race([once(child, "exit"), new Promise((yes) => setTimeout(yes, 2000))])
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    }
  }
  await rm(scratch, { recursive: true, force: true })
}
