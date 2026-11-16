// Self-hosted product analytics: no third-party service, no cookies, no IPs.
// A visitor is a random id the client keeps in localStorage (see
// client/src/analytics.js). We never store raw events — only a counter per
// (day, visitor, event), so one action = one tiny UPSERT and the tables stay
// small no matter how much people click.
//
// Client-reported events arrive via POST /api/e; game events (rooms,
// matches) are reported by the server itself from rooms.js hooks, using the
// visitor id the socket presented on connect.

export const CLIENT_EVENTS = new Set(['visit', 'online_open', 'howto_open', 'feedback_open'])
// Match events in a bot room are tracked with a 'bot_' prefix (see
// index.js's event hook), so human-vs-human play is never mixed with AI play.
export const SERVER_EVENTS = new Set([
  'room_create', 'room_join',
  'match_start', 'round_done', 'match_done', 'rematch',
  'bot_match_start', 'bot_round_done', 'bot_match_done', 'bot_rematch',
])

const VID_RE = /^[a-z0-9]{8,32}$/
export const isVid = v => typeof v === 'string' && VID_RE.test(v)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS visitors (
  vid       TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,      -- YYYY-MM-DD (UTC)
  source    TEXT,               -- utm_source or referrer host, '' = direct
  lang      TEXT,
  device    TEXT                -- 'mobile' | 'desktop'
);
CREATE TABLE IF NOT EXISTS daily (
  day   TEXT NOT NULL,
  vid   TEXT NOT NULL,
  event TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, vid, event)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS daily_event ON daily(event, day);
`

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : null)

export function createAnalytics(db, { now = () => Date.now() } = {}) {
  db.exec(SCHEMA)
  const bump = db.prepare('INSERT INTO daily (day, vid, event) VALUES (?, ?, ?) ON CONFLICT(day, vid, event) DO UPDATE SET n = n + 1')
  const addVisitor = db.prepare('INSERT OR IGNORE INTO visitors (vid, first_day, source, lang, device) VALUES (?, ?, ?, ?, ?)')

  function track(vid, event) {
    if (!isVid(vid)) return
    try { bump.run(today(now()), vid, event) } catch (e) { console.error('[analytics]', e.message) }
  }

  // Body of POST /api/e: { vid, events: string[], meta?: { source, lang, device } }
  function ingest(body) {
    if (!body || !isVid(body.vid) || !Array.isArray(body.events)) return false
    const events = body.events.filter(e => CLIENT_EVENTS.has(e)).slice(0, 20)
    if (!events.length) return false
    try {
      db.exec('BEGIN')
      if (events.includes('visit')) {
        const m = body.meta ?? {}
        addVisitor.run(body.vid, today(now()), clip(m.source, 60) ?? '', clip(m.lang, 8), m.device === 'mobile' ? 'mobile' : 'desktop')
      }
      for (const e of events) bump.run(today(now()), body.vid, e)
      db.exec('COMMIT')
    } catch (e) {
      try { db.exec('ROLLBACK') } catch {}
      console.error('[analytics]', e.message)
      return false
    }
    return true
  }

  return { track, ingest }
}

// Tiny fixed-window limiter per key (IP) — keeps one abusive client from
// spamming writes. In memory: resets on restart, which is fine.
export function rateLimiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const t = Date.now()
    const h = hits.get(key)
    if (!h || t - h.start > windowMs) { hits.set(key, { start: t, n: 1 }); return true }
    if (hits.size > 10000) hits.clear()
    return ++h.n <= max
  }
}
