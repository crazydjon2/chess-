// Owner pings: "someone is searching for an opponent right now" → a Telegram
// group and/or a Discord channel, with the room link, so whoever is in
// there can jump in and play. Configured by env, off when unset:
//   ADMIN_TG_TOKEN + ADMIN_TG_CHAT   — Telegram bot token + chat/group id
//   ADMIN_DISCORD_WEBHOOK            — Discord channel webhook URL
//   PUBLIC_URL                       — site address for links (default https://mischess.com)
const SITE = (process.env.PUBLIC_URL || 'https://mischess.com').replace(/\/$/, '')
const MIN_GAP_MS = 30_000 // never more than one ping per 30 s, whatever happens

let lastSent = 0

export function notifyEnabled(env = process.env) {
  return !!((env.ADMIN_TG_TOKEN && env.ADMIN_TG_CHAT) || env.ADMIN_DISCORD_WEBHOOK)
}

export function searchMessage({ name, code, waitedSec }) {
  const who = typeof name === 'string' && name.trim() ? name.trim().slice(0, 24) : 'Игрок'
  return `🔎 ${who} ищет соперника уже ${waitedSec} с\n${SITE}/room/${code}`
}

// Fire-and-forget: a failed ping must never touch the game.
export async function notifyAdmins(text, { env = process.env, fetchFn = globalThis.fetch, now = Date.now() } = {}) {
  if (!notifyEnabled(env) || now - lastSent < MIN_GAP_MS) return false
  lastSent = now
  const jobs = []
  if (env.ADMIN_TG_TOKEN && env.ADMIN_TG_CHAT) {
    for (const chat of String(env.ADMIN_TG_CHAT).split(',').map(s => s.trim()).filter(Boolean)) {
      jobs.push(fetchFn(`https://api.telegram.org/bot${env.ADMIN_TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      }))
    }
  }
  if (env.ADMIN_DISCORD_WEBHOOK) {
    jobs.push(fetchFn(env.ADMIN_DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No @everyone / role pings from a player-typed nickname.
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
    }))
  }
  const results = await Promise.allSettled(jobs)
  for (const r of results) if (r.status === 'rejected') console.error('[notify]', r.reason?.message ?? r.reason)
  return true
}

export function _resetNotifyForTests() { lastSent = 0 }
