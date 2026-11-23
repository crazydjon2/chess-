import { describe, it, expect, beforeEach } from 'vitest'
import { notifyAdmins, notifyEnabled, searchMessage, _resetNotifyForTests } from './notify.js'

describe('owner pings (notify.js)', () => {
  beforeEach(() => _resetNotifyForTests())

  it('is off without config', async () => {
    expect(notifyEnabled({})).toBe(false)
    expect(await notifyAdmins('x', { env: {}, fetchFn: () => { throw new Error('no') } })).toBe(false)
  })

  it('posts to every Telegram chat and the Discord webhook, without mentions, at most once per 30 s', async () => {
    const calls = []
    const fetchFn = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true } }
    const env = { ADMIN_TG_TOKEN: 'T', ADMIN_TG_CHAT: '-100, 42', ADMIN_DISCORD_WEBHOOK: 'https://discord.test/hook' }
    const text = searchMessage({ name: '@everyone', code: 'ABCDE', waitedSec: 10 })
    expect(text).toContain('/room/ABCDE')
    expect(await notifyAdmins(text, { env, fetchFn, now: 1_000_000 })).toBe(true)
    expect(calls.map(c => c.url)).toEqual(['https://api.telegram.org/botT/sendMessage', 'https://api.telegram.org/botT/sendMessage', 'https://discord.test/hook'])
    expect(calls.map(c => c.body.chat_id).slice(0, 2)).toEqual(['-100', '42'])
    expect(calls[2].body.allowed_mentions).toEqual({ parse: [] })
    expect(await notifyAdmins(text, { env, fetchFn, now: 1_010_000 })).toBe(false)
    expect(await notifyAdmins(text, { env, fetchFn, now: 1_031_000 })).toBe(true)
  })

  it('a failing endpoint never throws', async () => {
    const env = { ADMIN_DISCORD_WEBHOOK: 'https://discord.test/hook' }
    await expect(notifyAdmins('x', { env, fetchFn: async () => { throw new Error('down') }, now: 5e6 })).resolves.toBe(true)
  })
})
