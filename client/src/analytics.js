// Self-hosted, anonymous product analytics (server/analytics.js). A random
// visitor id lives in localStorage — no cookies, no personal data. Events
// are batched and sent with sendBeacon; game events (rooms, matches) are
// counted by the server itself, so only UI-level events are sent from here.
import { API_BASE } from './net/serverUrl'

const VID_KEY = 'chessplus_vid'
const VID_RE = /^[a-z0-9]{8,32}$/

function randomId() {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4)
}

function loadVid() {
  try {
    const v = localStorage.getItem(VID_KEY)
    if (v && VID_RE.test(v)) return v
    const fresh = randomId()
    localStorage.setItem(VID_KEY, fresh)
    return fresh
  } catch {
    return randomId() // storage blocked: a per-tab id is still better than nothing
  }
}

export const visitorId = loadVid()

let queue = []
let meta = null
let timer = null

function flush() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!queue.length) return
  // A plain string body = text/plain: a "simple" request, so the dev
  // client (other port) needs no CORS preflight, and sendBeacon accepts it.
  const body = JSON.stringify({ vid: visitorId, events: queue, ...(meta && { meta }) })
  queue = []
  meta = null
  const url = `${API_BASE}/api/e`
  try {
    if (navigator.sendBeacon?.(url, body)) return
  } catch { /* fall through */ }
  fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {})
}

export function track(event) {
  queue.push(event)
  if (!timer) timer = setTimeout(flush, 1500)
}

function source() {
  try {
    const p = new URLSearchParams(location.search)
    const utm = p.get('utm_source') || p.get('ref')
    if (utm) return utm.toLowerCase()
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '')
      if (host && host !== location.hostname) return host
    }
  } catch { /* ignore */ }
  return ''
}

// Once per page load. The source/lang/device meta is stored only for a
// visitor's very first visit (server ignores it afterwards).
export function trackVisit(lang) {
  const mobile = window.matchMedia?.('(pointer: coarse)').matches || /Mobi|Android/i.test(navigator.userAgent)
  meta = { source: source(), lang, device: mobile ? 'mobile' : 'desktop' }
  track('visit')
  flush()
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}
