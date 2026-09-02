#!/usr/bin/env node
// Behavioral eval harness for the claude-pi skills.
//
// Unit tests (vitest) prove the MCP server works. These evals prove the *skills* change
// Claude's delegation behavior — a different question, answerable only by driving a real
// Claude Code session and watching which tools it actually calls.
//
// How it works:
//   1. csd launches a Claude worker in tmux, cwd = this repo (already trusted).
//   2. --mcp-config + --strict-mcp-config point the `pi` server at a stub, so the worker's
//      pi_* calls are genuine MCP calls that cost nothing. --real swaps in bin/server/index.js.
//   3. Assertions read csd's pre_tool_use event stream — which tools were called, with which
//      args — not the worker's prose. A worker can describe a plan it never executed; the
//      event stream cannot be talked into lying.
//
// Tiers are asserted through the real getTier(), never a hardcoded model list, so the evals
// hold against whatever fleet Pi actually serves.
//
// Usage:
//   node tests/eval/run-evals.mjs [--only <substr>] [--real] [--model <m>] [--timeout <s>]

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { getTier } from '../../bin/server/types.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCENARIOS = join(REPO, 'tests', 'scenarios')
const WORK = join(tmpdir(), 'claude-pi-eval')

const CSD = process.env.CSD_BIN ?? join(
  process.env.HOME, '.claude', 'plugins', 'cache', 'superpowers-marketplace',
  'claude-session-driver', '4.0.0', 'skills', 'driving-claude-code-sessions', 'scripts', 'csd'
)

// ---------------------------------------------------------------- cases

const check = (label, pass, detail) => ({ label, pass, detail })

// Find the spawn whose task text matches `re`, and report the tier of the model it chose.
const tierOf = (spawns, re) => {
  const hit = spawns.find(s => re.test(String(s.tool_input?.task ?? '')))
  if (!hit) return { found: false }
  const model = String(hit.tool_input?.model ?? '')
  return { found: true, model, tier: getTier(model.includes('/') ? model.split('/').pop() : model) }
}

const tierCheck = (spawns, label, re, want) => {
  const t = tierOf(spawns, re)
  if (!t.found) return check(label, false, `no spawn matched ${re}`)
  return check(label, t.tier === want, `${t.model} → ${t.tier} (want ${want})`)
}

const CASES = [
  {
    name: 'delegation/green',
    scenario: 'delegation-baseline.md',
    skill: true,
    assert: (calls) => {
      const d = calls.filter(c => c.name === 'pi_run_task' || c.name === 'pi_spawn_agent')
      return [check('delegates the mechanical task to Pi', d.length >= 1, `${d.length} delegation call(s)`)]
    },
  },
  {
    // Baseline arm: MCP tools present, orchestrate skill absent. Reported, never scored —
    // delegating without the skill is a fine outcome, just not the one we assert on.
    name: 'delegation/red',
    scenario: 'delegation-baseline.md',
    skill: false,
    baseline: true,
  },
  {
    name: 'model-selection/green',
    scenario: 'model-selection-pressure.md',
    skill: true,
    assert: (calls) => {
      const spawns = calls.filter(c => c.name === 'pi_spawn_agent')
      return [
        check('spawns all three tasks', spawns.length >= 3, `${spawns.length} spawn(s)`),
        check('polls for progress', calls.some(c => c.name === 'pi_poll_agent'), 'pi_poll_agent'),
        tierCheck(spawns, 'CSV transform → fast tier', /csv/i, 'fast'),
        tierCheck(spawns, 'JSDoc generation → fast tier', /jsdoc|doc comment/i, 'fast'),
        tierCheck(spawns, 'cache architecture → frontier tier', /cache|invalidat/i, 'frontier'),
      ]
    },
  },
]

// ---------------------------------------------------------------- csd plumbing

const sh = (bin, args, opts = {}) =>
  execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })

const writeMcpConfig = (real) => {
  mkdirSync(WORK, { recursive: true })
  const path = join(WORK, real ? 'real-mcp.json' : 'stub-mcp.json')
  // pi_run_task / pi_spawn_agent default an agent's cwd to the MCP server's process.cwd().
  // In --real mode those are live agents with file access, so start the server in a scratch
  // dir — otherwise an unsupervised Pi agent writes into this repo.
  const sandbox = join(WORK, 'agent-cwd')
  mkdirSync(sandbox, { recursive: true })
  const server = real
    ? { command: 'sh', args: ['-c', `cd ${JSON.stringify(sandbox)} && exec node ${JSON.stringify(join(REPO, 'bin', 'server', 'index.js'))}`] }
    : { command: 'node', args: [join(REPO, 'tests', 'eval', 'stub-pi-server.mjs')] }
  writeFileSync(path, JSON.stringify({ mcpServers: { pi: server } }, null, 2) + '\n')
  return path
}

// csd events are JSONL: { event, ts, tool, tool_input }. Keep only pi_* MCP calls and
// normalize "mcp__pi__pi_spawn_agent" → "pi_spawn_agent".
const piCalls = (shim) => {
  const raw = sh(shim, ['read-events', '--type', 'pre_tool_use'], { stdio: ['ignore', 'pipe', 'ignore'] })
  return raw.split('\n').flatMap(line => {
    if (!line.trim()) return []
    let e
    try { e = JSON.parse(line) } catch { return [] }
    const tool = String(e.tool ?? '')
    if (!tool.includes('pi_')) return []
    return [{ name: tool.split('__').pop(), tool_input: e.tool_input ?? {} }]
  })
}

const runCase = (c, opts) => {
  const worker = `pi-eval-${c.name.replace(/\W+/g, '-')}`
  const shim = `/tmp/csd-workers/bin/${worker}`
  const prompt = readFileSync(join(SCENARIOS, c.scenario), 'utf8')

  const args = ['--mcp-config', opts.mcpConfig, '--strict-mcp-config']
  if (c.skill) args.push('--plugin-dir', REPO)
  if (opts.model) args.push('--model', opts.model)

  process.stderr.write(`\n▶ ${c.name}  (skill=${c.skill}, mode=${opts.real ? 'real' : 'stub'})\n`)
  sh(CSD, ['launch', worker, REPO, '--', ...args], { stdio: ['ignore', 'ignore', 'ignore'] })

  let calls = []
  let crashed = null
  try {
    sh(shim, ['converse', prompt, String(opts.timeout)], { stdio: ['ignore', 'ignore', 'ignore'] })
    calls = piCalls(shim)
  } catch (err) {
    // A converse timeout still leaves a usable event stream — read it before giving up.
    try { calls = piCalls(shim) } catch { /* worker is gone */ }
    crashed = err.message.split('\n')[0]
  } finally {
    try { sh(shim, ['stop'], { stdio: 'ignore' }) } catch { /* already gone */ }
  }

  const summary = calls.length
    ? calls.map(c2 => c2.name).join(', ')
    : '(no pi_* tool calls)'

  if (c.baseline) {
    process.stderr.write(`  baseline (not scored): ${summary}\n`)
    return { name: c.name, baseline: true, calls: calls.length, summary, crashed }
  }

  // A malformed event (csd changing tool_input shape, say) must not take down the whole run
  // and cost every remaining case — degrade to a FAIL and keep going.
  let results
  try {
    results = c.assert(calls)
  } catch (err) {
    results = [check('assertions ran', false, `assertion threw: ${err.message}`)]
  }
  for (const r of results) {
    process.stderr.write(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label} — ${r.detail}\n`)
  }
  if (crashed) process.stderr.write(`  note: ${crashed}\n`)
  return { name: c.name, results, calls: calls.length, summary, crashed }
}

// ---------------------------------------------------------------- main

const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const opts = {
  real: argv.includes('--real'),
  only: flag('--only', null),
  model: flag('--model', null),
  timeout: Number(flag('--timeout', '420')),
}

if (!existsSync(CSD)) {
  console.error(`csd not found at ${CSD}\nInstall the claude-session-driver skill, or set CSD_BIN.`)
  process.exit(2)
}
if (!existsSync(join(REPO, 'bin', 'server', 'tools.js'))) {
  console.error('bin/ is missing — run `npm run build` first (bin/ is what actually runs).')
  process.exit(2)
}

opts.mcpConfig = writeMcpConfig(opts.real)

// The worker runs with cwd = this repo and permissions bypassed. Scenarios are decision
// tasks that should touch nothing, so a dirtied tree means a worker went off-script.
const treeBefore = sh('git', ['-C', REPO, 'status', '--porcelain'])

const selected = CASES.filter(c => !opts.only || c.name.includes(opts.only))
if (!selected.length) { console.error(`no case matches --only ${opts.only}`); process.exit(2) }

process.stderr.write(
  `claude-pi behavioral evals — ${selected.length} case(s), ` +
  `${opts.real ? 'REAL Pi (spends tokens)' : 'stubbed Pi (free)'}, timeout ${opts.timeout}s\n`
)

const report = selected.map(c => runCase(c, opts))

const treeAfter = sh('git', ['-C', REPO, 'status', '--porcelain'])
if (treeAfter !== treeBefore) {
  process.stderr.write('\n!! a worker modified the repo working tree — inspect `git status` before trusting this run\n')
}

const scored = report.filter(r => !r.baseline)
const failed = scored.filter(r => r.results.some(x => !x.pass))

process.stderr.write('\n── summary ──\n')
for (const r of report) {
  if (r.baseline) { process.stderr.write(`  baseline  ${r.name}: ${r.summary}\n`); continue }
  const bad = r.results.filter(x => !x.pass).length
  process.stderr.write(`  ${bad ? `FAIL(${bad})` : 'PASS   '}  ${r.name}: ${r.summary}\n`)
}
process.stderr.write(
  '\nThese are LLM evals — a single run is stochastic. One failure is a signal to re-run,\n' +
  'not proof of a regression; a repeated failure is.\n'
)

process.exit(failed.length ? 1 : 0)
