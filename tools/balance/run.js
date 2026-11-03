#!/usr/bin/env node
// Chess+ balance lab — see README.md.
//
//   node tools/balance/run.js                      # default set, normal AI
//   node tools/balance/run.js cards items --n 30   # chosen experiments
//   node tools/balance/run.js --preset quick       # fast sanity pass
//   node tools/balance/run.js --preset deep        # big, strong-AI run
//   node tools/balance/run.js --save-baseline      # remember these numbers
//   node tools/balance/run.js --compare            # diff vs the baseline
//   node tools/balance/run.js --replay <results.json> <index>
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { EXPERIMENTS, DEFAULT_SET } from './lib/experiments.js'
import { runPool } from './lib/pool.js'
import { analyze } from './lib/analysis.js'
import { renderHTML, printSummary, compareMetrics } from './lib/report.js'
import { seedFor, mulberry32 } from './lib/rng.js'
import { serverFuzz } from './lib/serverFuzz.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORTS = path.join(HERE, 'reports')
const BASELINE = path.join(HERE, 'baseline.json')

const PRESETS = {
  quick: { n: 3, strength: 'weak', serverIters: 3000 },
  normal: { n: 12, strength: 'normal', serverIters: 20000 },
  deep: { n: 40, strength: 'strong', serverIters: 100000 },
}

function parseArgs(argv) {
  const a = { exps: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t.startsWith('--')) {
      const k = t.slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      a.flags[k] = v
    } else a.exps.push(t)
  }
  return a
}

async function replay(file, index) {
  const { playRound } = await import('./lib/game.js')
  const { boards } = await import('./lib/engine.js')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const x = data.results[Number(index)]
  if (!x) throw new Error('no such game')
  const cfg = { ...x.cfg }
  if (cfg.board) cfg.pattern = boards.BOARD_PATTERNS[cfg.round].find(p => p.name === cfg.board)
  const rng = mulberry32(x.seed); Math.random = rng
  const rec = playRound(cfg, rng)
  console.log(`${x.exp} · сид ${x.seed} · раунд ${rec.round} · ${rec.board} · ${rec.result} ${rec.winner ?? ''} за ${rec.plies} полуходов`)
  console.log('Армии:', JSON.stringify(rec.armies))
  console.log('Расстановка:', JSON.stringify(rec.placements))
  console.log('Ходы:', rec.moves.join(' '))
  if (rec.violations.length) console.log('Нарушения:', rec.violations)
}

// Measured worth of every item (win contribution per copy, from the items
// experiment) — what the human-style drafters value things by (see
// draftAI.js). `__perCoin` converts worth to price units.
const VALUES = path.join(HERE, 'values.json')
function saveValues(analysis) {
  if (!analysis.items) { console.log('Нет эксперимента items — ценности не сохранены'); return }
  const values = {}
  for (const r of analysis.items.rows) values[r.key] = r.beta
  const positive = analysis.items.rows.filter(r => r.beta > 0)
  values.__perCoin = positive.reduce((s, r) => s + r.beta, 0) / positive.reduce((s, r) => s + r.cost, 0)
  fs.writeFileSync(VALUES, JSON.stringify({ date: new Date().toISOString(), games: analysis.items.games, values }, null, 2))
  console.log('Ценности предметов сохранены:', path.relative(process.cwd(), VALUES))
}

// Re-run the analysis (after tuning thresholds or the stats) on games that
// were already played, without playing them again.
function reanalyze(file, flags = {}) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const analysis = analyze(data.results)
  if (flags['save-values']) saveValues(analysis)
  const dir = path.dirname(file)
  fs.writeFileSync(path.join(dir, 'report.html'), renderHTML(analysis, data.meta, null))
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify({ meta: data.meta, analysis }, null, 1))
  fs.copyFileSync(path.join(dir, 'report.html'), path.join(REPORTS, 'latest.html'))
  console.log(printSummary(analysis))
  console.log(`\nОтчёт: ${path.relative(process.cwd(), path.join(dir, 'report.html'))}`)
}

async function main() {
  const { exps, flags } = parseArgs(process.argv.slice(2))
  if (flags.replay) return replay(flags.replay, exps[0] ?? 0)
  if (flags.reanalyze) return reanalyze(flags.reanalyze, flags)
  const preset = PRESETS[flags.preset ?? 'normal'] ?? PRESETS.normal
  const n = Number(flags.n ?? preset.n)
  const strength = flags.strength ?? preset.strength
  const seed = Number(flags.seed ?? 1)
  const workers = Number(flags.workers ?? Math.max(1, os.cpus().length - 1))
  const chosen = exps.length ? exps : DEFAULT_SET
  for (const e of chosen) if (!EXPERIMENTS[e]) throw new Error(`unknown experiment "${e}" (есть: ${Object.keys(EXPERIMENTS).join(', ')})`)

  // Build jobs.
  const jobs = []
  for (const exp of chosen) {
    for (const cfg of EXPERIMENTS[exp].jobs(n)) {
      const withAI = cfg.ai ? cfg : { ...cfg, ai: { white: strength, black: strength } }
      jobs.push({ id: jobs.length, exp, seed: seedFor(seed, jobs.length), cfg: withAI })
    }
  }
  console.log(`Эксперименты: ${chosen.join(', ')} · ${jobs.length} партий · ИИ ${strength} · потоков ${workers}`)
  const t0 = Date.now()
  let lastPrint = 0
  const results = await runPool(jobs, {
    workers,
    onProgress: (done, total, ms) => {
      if (Date.now() - lastPrint < 2000 && done < total) return
      lastPrint = Date.now()
      const eta = done ? Math.round((ms / done) * (total - done) / 1000) : 0
      process.stdout.write(`\r  ${done}/${total} партий · ${Math.round(ms / 1000)} с · осталось ~${eta} с   `)
    },
  })
  console.log('')

  // Server-level fuzzing (cheap; runs in this thread with a fake clock).
  let server = null
  if (chosen.includes('fuzz') || flags['server-fuzz']) {
    const iters = Number(flags['server-iters'] ?? preset.serverIters)
    process.stdout.write(`  Фаззинг сервера: ${iters} событий… `)
    server = serverFuzz({ iterations: iters, seed })
    console.log(`проблем: ${server.issues.length}`)
  }

  const analysis = analyze(results)
  if (server) {
    analysis.server = server
    for (const i of server.issues.slice(0, 10)) analysis.flags.unshift({ severity: 'high', area: 'Сервер', text: `${i.kind} (${i.count}×): ${i.detail}` })
  }

  let comparison = null
  if (flags.compare && fs.existsSync(BASELINE)) {
    const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    comparison = compareMetrics(base.metrics, analysis.metrics)
  }
  if (flags['save-values']) saveValues(analysis)
  if (flags['save-baseline']) {
    fs.writeFileSync(BASELINE, JSON.stringify({ date: new Date().toISOString(), seed, n, strength, experiments: chosen, metrics: analysis.metrics }, null, 2))
    console.log('Эталон сохранён:', path.relative(process.cwd(), BASELINE))
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(REPORTS, stamp)
  fs.mkdirSync(dir, { recursive: true })
  const meta = { date: new Date().toLocaleString('ru-RU'), games: results.length, experiments: chosen, strength, seed, seconds: (Date.now() - t0) / 1000 }
  fs.writeFileSync(path.join(dir, 'report.html'), renderHTML(analysis, meta, comparison))
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify({ meta, analysis }, null, 1))
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ meta, results }))
  fs.copyFileSync(path.join(dir, 'report.html'), path.join(REPORTS, 'latest.html'))
  console.log(printSummary(analysis))
  if (comparison?.length) {
    console.log('\nИзменения относительно эталона:')
    for (const c of comparison.slice(0, 20)) console.log(`  ${c.key}: ${c.before?.toFixed?.(3)} → ${c.after?.toFixed?.(3)}`)
  }
  console.log(`\nОтчёт: ${path.relative(process.cwd(), path.join(dir, 'report.html'))}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
