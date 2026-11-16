// Player feedback from the in-game form (POST /api/feedback). Always stored
// in SQLite (see /admin/feedback); also emailed when configured:
//   RESEND_API_KEY  — key from resend.com (free tier). Hosts like Railway
//                     block outbound SMTP, so mail goes over Resend's HTTPS API.
//   FEEDBACK_TO     — where to send (with Resend's default sender this must
//                     be the address the Resend account was registered with)
//   FEEDBACK_FROM   — optional; default 'Mischess <onboarding@resend.dev>'.
//                     Set e.g. 'Mischess <feedback@mischess.com>' once the
//                     domain is verified in Resend.
//
// Spam protection, no captcha (index.js also rate-limits per IP):
//   - honeypot field `hp` (hidden from people, bots fill it)
//   - `ms`: time the form was open — instant or missing = a script
//   - links: more than 2 URLs = advertising
//   - duplicates of the same text within a day
//   - per-visitor and global daily caps; mail has its own cap, so even a
//     flood that slips through can never bury the inbox
// Spam is dropped SILENTLY (reported as success) so bots learn nothing.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feedback (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  vid     TEXT,
  text    TEXT NOT NULL,
  contact TEXT,               -- unused since the contact field was removed
  lang    TEXT,
  page    TEXT,
  mailed  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS feedback_ts ON feedback(ts);
`

export const MAX_TEXT = 2000
export const LIMITS = {
  minOpenMs: 2500,     // nobody reads the form and types a message faster
  maxLinks: 2,
  perVisitorPerDay: 10,
  storedPerDay: 300,
  mailedPerDay: 40,
}
const DAY = 864e5

const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Why a submission looks like spam, or null if it looks human.
export function spamReason(body) {
  if (typeof body?.hp === 'string' && body.hp.trim()) return 'honeypot'
  const ms = Number(body?.ms)
  if (!Number.isFinite(ms) || ms < LIMITS.minOpenMs) return 'too-fast'
  const links = (String(body.text).match(/https?:\/\/|www\./gi) ?? []).length
  if (links > LIMITS.maxLinks) return 'links'
  return null
}

export function createFeedback(db, { env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  db.exec(SCHEMA)
  const insert = db.prepare('INSERT INTO feedback (ts, vid, text, lang, page) VALUES (?, ?, ?, ?, ?)')
  const markMailed = db.prepare('UPDATE feedback SET mailed = 1 WHERE id = ?')
  const countSince = db.prepare('SELECT COUNT(*) n FROM feedback WHERE ts >= ?')
  const countVidSince = db.prepare('SELECT COUNT(*) n FROM feedback WHERE ts >= ? AND vid = ?')
  const mailedSince = db.prepare('SELECT COUNT(*) n FROM feedback WHERE ts >= ? AND mailed = 1')
  const sameText = db.prepare('SELECT 1 FROM feedback WHERE ts >= ? AND text = ? LIMIT 1')

  async function mail(row) {
    if (!env.RESEND_API_KEY || !env.FEEDBACK_TO) return
    if (mailedSince.get(now() - DAY).n >= LIMITS.mailedPerDay) return // stored, just not mailed
    const subject = `Mischess feedback: ${row.text.slice(0, 60).replace(/\s+/g, ' ')}`
    const html = `<p style="white-space:pre-wrap;font-size:15px">${esc(row.text)}</p><hr>
      <p style="color:#777;font-size:13px">Lang: ${esc(row.lang)} · Page: ${esc(row.page)}<br>Visitor: ${esc(row.vid)}</p>`
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.FEEDBACK_FROM || 'Mischess <onboarding@resend.dev>', to: [env.FEEDBACK_TO], subject, html }),
    })
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
    markMailed.run(row.id)
  }

  // false = empty submission (client shows an error); true = accepted OR
  // silently dropped as spam. Mailing runs in the background — a mail outage
  // never fails the player's submit.
  function submit(body) {
    const text = clip(body?.text, MAX_TEXT)
    if (!text) return false
    const row = { vid: clip(body.vid, 32), text, lang: clip(body.lang, 8), page: clip(body.page, 80) }
    const since = now() - DAY
    const drop = spamReason(body)
      ?? (sameText.get(since, text) ? 'duplicate' : null)
      ?? (row.vid && countVidSince.get(since, row.vid).n >= LIMITS.perVisitorPerDay ? 'visitor-cap' : null)
      ?? (countSince.get(since).n >= LIMITS.storedPerDay ? 'daily-cap' : null)
    if (drop) {
      console.warn(`[feedback] dropped (${drop})`)
      return true
    }
    row.id = Number(insert.run(now(), row.vid, row.text, row.lang, row.page).lastInsertRowid)
    mail(row).catch(e => console.error('[feedback] mail failed:', e.message))
    return true
  }

  return { submit }
}
