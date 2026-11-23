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
  // Telegram/Discord answer a bad token / wrong chat id with a normal HTTP
  // error, not a network failure — log those too, or a broken config is silent.
  const report = []
  for (const r of results) {
    if (r.status === 'rejected') { report.push(`network error: ${r.reason?.message ?? r.reason}`); continue }
    const res = r.value
    if (res?.ok === false) {
      let body = ''
      try { body = (await res.text()).slice(0, 300) } catch { /* ignore */ }
      report.push(`HTTP ${res.status}: ${body}`)
    } else report.push('ok')
  }
  for (const line of report) if (line !== 'ok') console.error('[notify]', line)
  lastReport = report
  return true
}

// What the last send got back — for /admin/notify-test.
let lastReport = []
export function lastNotifyReport() { return lastReport }

export function _resetNotifyForTests() { lastSent = 0 }

// /admin/notify-test: send a test ping now (ignores the 30 s gap) and say
// exactly what Telegram/Discord answered.
export async function sendTestPing(env = process.env) {
  if (!notifyEnabled(env)) {
    // Names only (never values) of anything that looks like it was meant to
    // be these settings — catches typos, stray spaces, Cyrillic letters.
    const similar = Object.keys(env).filter(k => /ADMIN|TG|TELEGRAM/i.test(k)).map(k => JSON.stringify(k))
    return [
      `Уведомления выключены: нет ${!env.ADMIN_TG_TOKEN ? 'ADMIN_TG_TOKEN' : !env.ADMIN_TG_CHAT ? 'ADMIN_TG_CHAT' : 'настроек'}.`,
      `Похожие переменные, которые видит сервер: ${similar.length ? similar.join(', ') : 'нет ни одной'}`,
    ].join('\n')
  }
  lastSent = 0
  await notifyAdmins(`✅ Тест уведомлений Mischess\n${SITE}`, { env })
  const chats = String(env.ADMIN_TG_CHAT ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return [`Чатов Telegram: ${chats.length} (${chats.join(', ')})`, `Discord: ${env.ADMIN_DISCORD_WEBHOOK ? 'да' : 'нет'}`, 'Ответы:', ...lastReport].join('\n')
}
