// Offline CLI-boundary checks. The real subscription probe lives in probe-direct.mjs.
/* oxlint-disable effecttsgo/prefer-effect-string, effecttsgo/global-console, effecttsgo/process-env -- Independent native-CLI fixture checks credential isolation without calling a provider. */
import assert from "node:assert/strict"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import { Effect, Schema as S } from "effect"
import { LanguageModel } from "effect/ai"

import { Trait } from "../../traits/Trait.ts"
import * as Codex from "./codex-language-model.mjs"

const directory = await mkdtemp(join(tmpdir(), "traits-codex-guard-fixture-"))
const executable = join(directory, "codex-fixture")
const state = join(directory, "state.json")
const receipt = join(directory, "receipt.json")
const schema = S.Struct({ traits: S.Array(Trait), requiredNullable: S.NullOr(S.String) })
const fixturePids = []
const invoke = (options = {}, prompt = "Fixture") =>
  Effect.runPromise(
    LanguageModel.generateObject({ prompt, schema }).pipe(Effect.provide(Codex.layer({ codex: executable }))),
    options
  )
try {
  await writeFile(
    executable,
    `#!${process.execPath}
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(${JSON.stringify(state)},'utf8'));
if(process.argv[2]==='login'){
  console.error(config.apiKey ? 'Logged in using an API key' : 'Logged in using ChatGPT');
  process.exit(0);
}
const prohibited=['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','TYPESAFE_API_KEY'];
if(prohibited.some(key=>process.env[key]!==undefined)) process.exit(9);
if(config.hang || config.pipeFailure){
  process.on('SIGTERM',()=>{});
  fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({pid:process.pid}));
  if(config.pipeFailure) fs.closeSync(0); else process.stdin.resume();
  setInterval(()=>{},1000);
} else {
fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({apiKeyVariablesAbsent:true}));
const output=process.argv[process.argv.indexOf('--output-last-message')+1];
fs.writeFileSync(output,JSON.stringify({traits:[{name:'prefer-const',subject:'Bindings',requirement:'Prefer const',purpose:'Clarity',applicability:null,context:null}],requiredNullable:null}));
process.stdin.resume();
process.stdin.on('end',()=>console.log(JSON.stringify({type:'turn.completed'})));
}
`,
    { mode: 0o700 }
  )
  await writeFile(state, JSON.stringify({ apiKey: true }))
  await assert.rejects(invoke, /signed in with ChatGPT/)
  await assert.rejects(readFile(receipt), { code: "ENOENT" })
  console.log("PASS offline guard: API-key login is rejected before generation")
  await writeFile(state, JSON.stringify({ apiKey: false }))
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "TYPESAFE_API_KEY"])
    process.env[key] = "fixture-not-a-real-key"
  const response = await invoke()
  assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), { apiKeyVariablesAbsent: true })
  assert.equal(response.value.traits[0].name, "prefer-const")
  assert.equal(response.value.traits[0].applicability, undefined)
  assert.equal(response.value.traits[0].context, undefined)
  assert.equal(response.value.requiredNullable, null)
  console.log("PASS offline guard: API credentials are absent from child environment")
  console.log("PASS offline schema: optional nulls are omitted while required null values survive")
  await rm(receipt)
  await writeFile(state, JSON.stringify({ apiKey: false, hang: true }))
  const controller = new AbortController()
  const pending = invoke({ signal: controller.signal }).then(
    () => assert.fail("Cancelled generation unexpectedly succeeded"),
    () => true
  )
  let pid
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      pid = JSON.parse(await readFile(receipt, "utf8")).pid
      break
    } catch {
      await delay(20)
    }
  }
  assert.equal(typeof pid, "number")
  fixturePids.push(pid)
  controller.abort()
  await pending
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  console.log("PASS offline cancellation: SIGTERM-resistant child is killed and awaited before completion")
  await rm(receipt)
  await writeFile(state, JSON.stringify({ apiKey: false, pipeFailure: true }))
  await assert.rejects(
    () => invoke({ signal: AbortSignal.timeout(5000) }, "Fixture".repeat(200000)),
    /input pipe failed/
  )
  const pipePid = JSON.parse(await readFile(receipt, "utf8")).pid
  fixturePids.push(pipePid)
  assert.throws(() => process.kill(pipePid, 0), { code: "ESRCH" })
  console.log("PASS offline pipe failure: subprocess cannot outlive a rejected writer call")
} finally {
  for (const pid of fixturePids) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      /* already stopped */
    }
  }
  await rm(directory, { recursive: true, force: true })
}
