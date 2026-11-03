// Shared plumbing for the UI tester: server/client startup, browser
// pages with error capture, step recording, layout checks, screenshots.
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright-core'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'mobile-small': { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
}

export function buildClient() {
  execSync('npm run build --prefix client', { cwd: ROOT, stdio: 'pipe' })
}

export function startServer(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
    const logs = []
    const onData = d => {
      const t = d.toString()
      logs.push(t)
      if (t.includes('listening')) resolve({ proc, logs, url: `http://localhost:${port}` })
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', d => logs.push(d.toString()))
    proc.on('exit', code => reject(new Error('server exited ' + code + '\n' + logs.join(''))))
    setTimeout(() => reject(new Error('server did not start\n' + logs.join(''))), 15000)
  })
}

export async function launchBrowser({ headed = false } = {}) {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: !headed }) } catch { /* try next */ }
  }
  return chromium.launch({ headless: !headed })
}

// A recorder for one run: steps, errors, layout issues, screenshots.
export class Recorder {
  constructor(dir) {
    this.dir = dir
    this.steps = []
    this.errors = []
    this.layout = []
    this.shots = 0
    fs.mkdirSync(path.join(dir, 'shots'), { recursive: true })
  }
  async shot(page, label) {
    const file = `shots/${String(++this.shots).padStart(3, '0')}-${label.replace(/[^\wа-яё-]+/gi, '_').slice(0, 60)}.png`
    try { await page.screenshot({ path: path.join(this.dir, file) }) } catch { return null }
    return file
  }
  async step(scenario, name, page, fn, { critical = false, shot = false } = {}) {
    const t0 = Date.now()
    try {
      await fn()
      const rec = { scenario, name, ok: true, ms: Date.now() - t0 }
      if (shot && page) {
        for (const p of (Array.isArray(page) ? page : [page])) {
          const f = await this.shot(p, `${scenario}-${name}-${p.label}`)
          rec.shot ??= f
        }
      }
      this.steps.push(rec)
      return true
    } catch (e) {
      const rec = { scenario, name, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).split('\n').slice(0, 4).join('\n') }
      // Multi-player steps: capture every player's screen, plus whatever
      // message the game itself was showing them (often the real reason).
      const pages = (Array.isArray(page) ? page : [page]).filter(Boolean)
      for (const p of pages) {
        const toast = await p.locator('.game-toast').first().innerText({ timeout: 300 }).catch(() => null)
        if (toast) rec.error += `\n[${p.label}] игра показала: «${toast}»`
        const shot = await this.shot(p, `FAIL-${scenario}-${name}-${p.label}`)
        rec.shot ??= shot
        ;(rec.shots ??= []).push(shot)
      }
      this.steps.push(rec)
      console.log(`    ✗ ${scenario} › ${name}: ${rec.error.split('\n')[0]}`)
      if (critical) throw e
      return false
    }
  }
}

// Every page reports uncaught errors and console errors to the recorder.
export async function newPage(browser, profileName, rec, label) {
  const ctx = await browser.newContext({ ...PROFILES[profileName], locale: 'ru-RU' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  const page = await ctx.newPage()
  page.on('pageerror', e => rec.errors.push({ where: label, kind: 'exception', text: String(e?.message ?? e), url: page.url() }))
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/fonts\.g(oogle|static)|favicon|net::ERR_INTERNET|ERR_NAME_NOT_RESOLVED/.test(t)) return
    rec.errors.push({ where: label, kind: 'console', text: t, url: page.url() })
  })
  page.on('requestfailed', r => {
    const u = r.url()
    if (/fonts\.g(oogle|static)/.test(u)) return
    rec.errors.push({ where: label, kind: 'request', text: `${r.failure()?.errorText} ${u}`, url: page.url() })
  })
  page.label = label
  page.profile = profileName
  return page
}

// Layout sanity for whatever is on screen right now.
export async function checkLayout(page, rec, screen, { noScroll = false, mustSee = [] } = {}) {
  const res = await page.evaluate(({ mustSee }) => {
    const de = document.documentElement
    const out = { overflowX: de.scrollWidth - window.innerWidth, overflowY: de.scrollHeight - window.innerHeight, blank: false, offscreen: [], covered: [], tiny: [] }
    const root = document.getElementById('root')
    out.blank = !root || (root.innerText.trim().length === 0 && !root.querySelector('svg,img,canvas'))
    for (const sel of mustSee) {
      const els = [...document.querySelectorAll(sel)].filter(e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' })
      for (const e of els) {
        const r = e.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1 || r.left < -1 || r.top < -1) { out.offscreen.push(`${sel} (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`); continue }
        // On screen but buried under something else? Probe a few points.
        const pts = [[0.5, 0.5], [0.5, 0.15], [0.5, 0.85]]
        const covered = pts.filter(([fx, fy]) => {
          const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)
          return hit && !e.contains(hit) && !hit.contains(e)
        })
        if (covered.length >= 2) {
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.15)
          out.covered.push(`${sel} «${(e.innerText || '').trim().slice(0, 24)}» закрыт ${hit?.className || hit?.tagName}`)
        }
      }
    }
    // tap targets that are too small to hit on a phone
    if (window.innerWidth < 700) {
      for (const e of document.querySelectorAll('button, [role=button]')) {
        const r = e.getBoundingClientRect(), s = getComputedStyle(e)
        if (s.display === 'none' || s.visibility === 'hidden' || r.width === 0) continue
        if (r.width < 28 || r.height < 28) out.tiny.push(`${e.className || e.tagName} "${(e.innerText || e.title || '').trim().slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return out
  }, { mustSee })
  const where = `${page.label}/${page.profile} · ${screen}`
  if (res.blank) rec.layout.push({ where, kind: 'blank', text: 'Пустой экран' })
  if (res.overflowX > 1) rec.layout.push({ where, kind: 'overflow-x', text: `Горизонтальная прокрутка на ${res.overflowX}px` })
  if (noScroll && res.overflowY > 2) rec.layout.push({ where, kind: 'overflow-y', text: `Экран прокручивается на ${res.overflowY}px (должен влезать целиком)` })
  for (const o of res.offscreen) rec.layout.push({ where, kind: 'offscreen', text: `Элемент за краем экрана: ${o}` })
  for (const o of res.covered) rec.layout.push({ where, kind: 'covered', text: `Элемент перекрыт: ${o}` })
  for (const t of [...new Set(res.tiny)].slice(0, 6)) rec.layout.push({ where, kind: 'tap-target', text: `Слишком мелкая кнопка для пальца: ${t}` })
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))
