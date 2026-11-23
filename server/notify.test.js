import { describe, it, expect, beforeEach } from 'vitest'
import { notifyAdmins, notifyEnabled, searchMessage, _resetNotifyForTests } from './notify.js'

describe('owner pings (notify.js)', () => {
  beforeEach(() => _resetNotifyForTests())

  it('is off without config', async () => {
    expect(notifyEnabled({})).toBe(false)
    expect(await notifyAdmins('x', { env: {}, fetchFn: () => { throw new Error('no') } })).toBe(false)
  })

  it('posts to every Telegram chat and the Discord webhook, without mentions', async () => {
    const calls = []
    const fetchFn = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true } }
    const env = { ADMIN_TG_TOKEN: 'T', ADMIN_TG_CHAT: '-100, 42', ADMIN_DISCORD_WEBHOOK: 'https://discord.test/hook' }
    const text = searchMessage({ name: '@everyone', code: 'ABCDE', waitedSec: 10 })
    expect(text).toContain('/room/ABCDE')
    expect(await notifyAdmins(text, { env, fetchFn, now: 1_000_000 })).toBe(true)
    expect(calls.map(c => c.url)).toEqual(['https://api.telegram.org/botT/sendMessage', 'https://api.telegram.org/botT/sendMessage', 'https://discord.test/hook'])
    expect(calls.map(c => c.body.chat_id).slice(0, 2)).toEqual(['-100', '42'])
    expect(calls[2].body.allowed_mentions).toEqual({ parse: [] })
  })

  it('same player at most once per 2 min, different players always, 30 an hour overall', async () => {
    const env = { ADMIN_DISCORD_WEBHOOK: 'https://discord.test/hook' }
    const fetchFn = async () => ({ ok: true })
    const send = (key, now) => notifyAdmins('x', { key, env, fetchFn, now })
    expect(await send('alice', 1e6)).toBe(true)
    expect(await send('alice', 1e6 + 20_000)).toBe(false) // left and searched again
    expect(await send('bob', 1e6 + 21_000)).toBe(true)    // someone else — always
    expect(await send('alice', 1e6 + 121_000)).toBe(true)
    for (let i = 0; i < 27; i++) expect(await send(`p${i}`, 1e6 + 130_000 + i)).toBe(true)
    expect(await send('late', 1e6 + 200_000)).toBe(false) // 30 within the hour
    expect(await send('late', 1e6 + 3_700_000)).toBe(true)
  })

  it('a failing endpoint never throws', async () => {
    const env = { ADMIN_DISCORD_WEBHOOK: 'https://discord.test/hook' }
    await expect(notifyAdmins('x', { env, fetchFn: async () => { throw new Error('down') }, now: 5e6 })).resolves.toBe(true)
  })
})
