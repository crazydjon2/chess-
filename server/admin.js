// Owner-only pages, behind HTTP Basic auth (any username, password =
// STATS_KEY). Without STATS_KEY set they don't exist at all.
//   /admin/funnel      — visitors → matches funnel, retention, sources (?days=N)
//   /admin/feedback    — what players wrote in the in-game feedback form
//   /admin/notify-test — send a test Telegram/Discord ping, show the reply
//   /admin/stats       — the live balance report (same as `npm run stats`);
//                        ?ver=all|<hash> &mode=pvp|bot|all &days=N
//   /admin/stats.db    — a consistent copy of the SQLite file, for
//                        `npm run stats -- --db <file>` or ad-hoc SQL
import { timingSafeEqual, createHash, randomUUID } from 'crypto'
import { tmpdir } from 'os'
import path from 'path'
import { unlink } from 'fs'
import { loadRounds, buildStatsReport } from './statsReport.js'
import { buildFunnelReport, buildFeedbackPage } from './funnelReport.js'
import { sendTestPing } from './notify.js'

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
    res.set('WWW-Authenticate', 'Basic realm="Mischess admin", charset="UTF-8"').status(401).send('Нужен пароль')
  })

  // Every page needs the DB; reply 503 when stats are off.
  const withDb = (fn) => (req, res) => {
    const db = getDb()
    if (!db) return res.status(503).send('Статистика выключена (STATS=off или нет node:sqlite)')
    res.set('Cache-Control', 'no-store')
    fn(db, req, res)
  }

  app.get('/admin', (_req, res) => res.redirect('/admin/funnel'))

  app.get('/admin/funnel', withDb((db, req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 14))
    res.type('html').send(buildFunnelReport(db, { days }))
  }))

  // Sends a test owner ping and shows what Telegram/Discord answered.
  app.get('/admin/notify-test', async (_req, res) => {
    res.set('Cache-Control', 'no-store').type('text/plain; charset=utf-8').send(await sendTestPing())
  })

  app.get('/admin/feedback', withDb((db, _req, res) => res.type('html').send(buildFeedbackPage(db))))

  app.get('/admin/stats', withDb((db, req, res) => {
    const { ver, mode, days } = req.query
    const { html } = buildStatsReport(loadRounds(db), {
      nav: true,
      ...(typeof ver === 'string' && { ver }),
      ...(typeof mode === 'string' && { mode }),
      ...(days && { days: Number(days) }),
    })
    res.type('html').send(html)
  }))

  app.get('/admin/stats.db', (_req, res) => {
    const db = getDb()
    if (!db) return res.status(503).send('Статистика выключена')
    // VACUUM INTO writes a self-contained snapshot (WAL folded in), safe to
    // take while the server keeps writing.
    const file = path.join(tmpdir(), `chessplus-stats-${randomUUID()}.db`)
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    res.download(file, `mischess-stats-${new Date().toISOString().slice(0, 10)}.db`, () => unlink(file, () => {}))
  })
}
