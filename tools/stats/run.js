// Balance report from REAL games: reads the rounds the server recorded
// (server/stats.js) and writes tools/stats/reports/latest.html.
// The same report is served live at /admin/stats (see server/index.js).
//
//   npm run stats                       # current balance version, PvP (falls back to all modes if no PvP yet)
//   npm run stats -- --ver all          # every balance version mixed
//   npm run stats -- --ver 3fa1c2d0     # one specific version
//   npm run stats -- --mode bot|pvp|all
//   npm run stats -- --days 7           # only the last N days
//   npm run stats -- --db path/to/stats.db   # e.g. a copy downloaded from /admin/stats.db
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_DB } from '../../server/stats.js'
import { loadRounds, buildStatsReport } from '../../server/statsReport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const o = { db: process.env.STATS_DB || DEFAULT_DB, ver: 'current', mode: 'auto', days: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1]
    if (a === '--db') { o.db = v; i++ }
    else if (a === '--ver') { o.ver = v; i++ }
    else if (a === '--mode') { o.mode = v; i++ }
    else if (a === '--days') { o.days = Number(v); i++ }
  }
  return o
}

const o = parseArgs(process.argv.slice(2))
let all = [], notes = []
if (existsSync(o.db)) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(o.db, { readOnly: true })
  all = loadRounds(db)
  db.close()
} else {
  notes.push(`База ${o.db} не найдена — сервер ещё не записал ни одного раунда.`)
}
const { html, summary } = buildStatsReport(all, { ...o, notes })
const outDir = path.join(__dirname, 'reports')
mkdirSync(outDir, { recursive: true })
const file = path.join(outDir, 'latest.html')
writeFileSync(file, html)
console.log(summary)
console.log(`Отчёт: ${file}`)
