// Self-hosted product analytics: no third-party service, no cookies, no IPs.
// A visitor is a random id the client keeps in localStorage (see
// client/src/analytics.js). We never store raw events — only a counter per
// (day, visitor, event), so one action = one tiny UPSERT and the tables stay
// small no matter how much people click.
//
// Client-reported events arrive via POST /api/e; game events (rooms,
// matches) are reported by the server itself from rooms.js hooks, using the
// visitor id the socket presented on connect.

export const CLIENT_EVENTS = new Set([
  'visit', 'online_open', 'howto_open', 'feedback_open', 'discord_click',
  'friend_open', 'bot_open', 'share_quick', 'share_friend', 'invite_open',
])
// Match events in a bot room are tracked with a 'bot_' prefix (see
// index.js's event hook), so human-vs-human play is never mixed with AI play.
export const SERVER_EVENTS = new Set([
  'quick_search', 'room_create', 'room_join',
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
  device    TEXT,               -- 'mobile' | 'desktop'
  ua        TEXT,               -- User-Agent header of the first visit (clipped), to spot bots/scanners
  tz        TEXT                -- browser IANA time zone ('Europe/Berlin'), where players are
);
CREATE TABLE IF NOT EXISTS daily (
  day   TEXT NOT NULL,
  vid   TEXT NOT NULL,
  event TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, vid, event)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS daily_event ON daily(event, day);
-- How long people wait for an opponent, one row per finished wait:
--   kind 'browse' — looked at the public room list (rooms_seen = rooms in it
--                   when opened); outcome created | joined | bot | back | closed
--   kind 'host'   — sat alone in their own room; outcome joined | left | closed
CREATE TABLE IF NOT EXISTS waits (
  id         INTEGER PRIMARY KEY,
  day        TEXT NOT NULL,     -- UTC day the wait started
  vid        TEXT,
  kind       TEXT NOT NULL,
  visibility TEXT,              -- host waits: 'public' | 'private'
  rooms_seen INTEGER,           -- browse waits
  started_at INTEGER NOT NULL,  -- epoch ms
  wait_ms    INTEGER NOT NULL,
  outcome    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS waits_day ON waits(day);
`

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : null)
const TZ_RE = /^[A-Za-z0-9_+\-/]{1,40}$/
const timeZone = s => (typeof s === 'string' && TZ_RE.test(s) ? s : '')

export function createAnalytics(db, { now = () => Date.now() } = {}) {
  db.exec(SCHEMA)
  // Older databases predate the ua / tz columns.
  const cols = new Set(db.prepare('PRAGMA table_info(visitors)').all().map(c => c.name))
  for (const c of ['ua', 'tz']) if (!cols.has(c)) db.exec(`ALTER TABLE visitors ADD COLUMN ${c} TEXT`)
  const bump = db.prepare('INSERT INTO daily (day, vid, event) VALUES (?, ?, ?) ON CONFLICT(day, vid, event) DO UPDATE SET n = n + 1')
  const addVisitor = db.prepare('INSERT OR IGNORE INTO visitors (vid, first_day, source, lang, device, ua, tz) VALUES (?, ?, ?, ?, ?, ?, ?)')

  const addWait = db.prepare('INSERT INTO waits (day, vid, kind, visibility, rooms_seen, started_at, wait_ms, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

  // w = { vid, kind, visibility?, roomsSeen?, startedAt } — the wait ends now with `outcome`.
  function wait(w, outcome) {
    try {
      addWait.run(today(w.startedAt), isVid(w.vid) ? w.vid : null, w.kind, w.visibility ?? null, w.roomsSeen ?? null, w.startedAt, Math.max(0, now() - w.startedAt), outcome)
    } catch (e) { console.error('[analytics]', e.message) }
  }

  function track(vid, event) {
    if (!isVid(vid)) return
    try { bump.run(today(now()), vid, event) } catch (e) { console.error('[analytics]', e.message) }
  }

  // Body of POST /api/e: { vid, events: string[], meta?: { source, lang, device, tz } }
  // ua = the request's User-Agent header (stored only for a visitor's first visit).
  function ingest(body, ua = '') {
    if (!body || !isVid(body.vid) || !Array.isArray(body.events)) return false
    const events = body.events.filter(e => CLIENT_EVENTS.has(e)).slice(0, 20)
    if (!events.length) return false
    try {
      db.exec('BEGIN')
      if (events.includes('visit')) {
        const m = body.meta ?? {}
        addVisitor.run(body.vid, today(now()), clip(m.source, 60) ?? '', clip(m.lang, 8), m.device === 'mobile' ? 'mobile' : 'desktop', clip(ua, 200) ?? '', timeZone(m.tz))
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

  return { track, ingest, wait }
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
