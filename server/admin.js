// Owner-only pages, behind HTTP Basic auth (any username, password =
// STATS_KEY). Without STATS_KEY set they don't exist at all (404).
//   /admin/stats       — the live balance report (same as `npm run stats`);
//                        ?ver=all|<hash> &mode=pvp|bot|all &days=N
//   /admin/stats.db    — a consistent copy of the SQLite file, for
//                        `npm run stats -- --db <file>` or ad-hoc SQL
import { timingSafeEqual, createHash, randomUUID } from 'crypto'
import { tmpdir } from 'os'
import path from 'path'
import { unlink } from 'fs'
import { loadRounds, buildStatsReport } from './statsReport.js'

function sameSecret(a, b) {
  // Hash first so lengths always match (timingSafeEqual requires it).
  const h = s => createHash('sha256').update(String(s)).digest()
  return timingSafeEqual(h(a), h(b))
}

function authorized(req, key) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization ?? '')
  if (!m) return false
  const decoded = Buffer.from(m[1], 'base64').toString()
  const password = decoded.slice(decoded.indexOf(':') + 1)
  return sameSecret(password, key)
}

export function mountAdmin(app, getDb) {
  const key = process.env.STATS_KEY
  if (!key) return

  app.use('/admin', (req, res, next) => {
    if (authorized(req, key)) return next()
    res.set('WWW-Authenticate', 'Basic realm="Chess+ admin", charset="UTF-8"').status(401).send('Нужен пароль')
  })

  app.get('/admin/stats', (req, res) => {
    const db = getDb()
    if (!db) return res.status(503).send('Статистика выключена (STATS=off или нет node:sqlite)')
    const { ver, mode, days } = req.query
    const { html } = buildStatsReport(loadRounds(db), {
      ...(typeof ver === 'string' && { ver }),
      ...(typeof mode === 'string' && { mode }),
      ...(days && { days: Number(days) }),
    })
    res.set('Cache-Control', 'no-store').type('html').send(html)
  })

  app.get('/admin/stats.db', (_req, res) => {
    const db = getDb()
    if (!db) return res.status(503).send('Статистика выключена')
    // VACUUM INTO writes a self-contained snapshot (WAL folded in), safe to
    // take while the server keeps writing.
    const file = path.join(tmpdir(), `chessplus-stats-${randomUUID()}.db`)
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    res.download(file, `chessplus-stats-${new Date().toISOString().slice(0, 10)}.db`, () => unlink(file, () => {}))
  })
}
