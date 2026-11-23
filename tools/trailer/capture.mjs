// Records raw footage for the trailer into tools/trailer/footage/<shot>.mp4.
//   node tools/trailer/capture.mjs            # all shots
//   node tools/trailer/capture.mjs draft      # one shot
//   node tools/trailer/capture.mjs --desktop meteor  # 16:9 desktop layout → footage-desktop/
// Draft footage is a real match vs the bot on a local game server (built
// client); battle shots are staged in the dev sandbox (see shots.mjs).
import { chromium } from 'playwright-core'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { startRecording, stopRecording } from './lib/recorder.mjs'
import { SANDBOX_SHOTS } from './shots.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CLIENT = path.join(ROOT, 'client')
const DESKTOP = process.argv.includes('--desktop')
const FOOTAGE = path.join(HERE, DESKTOP ? 'footage-desktop' : 'footage')
const FRAMES = path.join(HERE, '.frames')
const VIEWPORT = DESKTOP ? { width: 1280, height: 720 } : { width: 432, height: 768 }
const DPR = DESKTOP ? 1.5 : 2.5   // → 1920×1080 / 1080×1920
const PORT = 4391

const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'))
const want = id => !wanted.length || wanted.includes(id)
const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(FOOTAGE, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
async function newPage() {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR })
  page.on('pageerror', e => console.error('page error:', e.message))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('chessplus_lang', 'en')
      localStorage.setItem('chessplus_sound_muted', '1')
      localStorage.setItem('chessplus_nickname', 'You')
      localStorage.setItem('chessplus_patchnotes_seen', '__all__')
    } catch { /* ignore */ }
  })
  return page
}

// Slow-motion world for staged shots: the page's JS clock and timers run
// SLOW× slower (CSS animations via CDP Animation.setPlaybackRate). Capture
// fps is limited (~17 at 1080×1920), so filming in slow-mo and speeding the
// clip back up gives smooth motion.
const SLOW = 4
function slowMo(S) {
  const realPerf = performance.now.bind(performance)
  const p0 = realPerf()
  performance.now = () => p0 + (realPerf() - p0) / S
  const realDate = Date.now
  const d0 = realDate()
  Date.now = () => d0 + (realDate() - d0) / S
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame
  window.setTimeout = (f, ms = 0, ...r) => st(f, ms * S, ...r)
  window.setInterval = (f, ms = 0, ...r) => si(f, ms * S, ...r)
  window.requestAnimationFrame = cb => raf(t => cb(p0 + (t - p0) / S))
}

async function record(page, id, fn, speed = 1) {
  const rec = await startRecording(page, path.join(FRAMES, id), { scale: DPR })
  await fn()
  const out = path.join(FOOTAGE, `${id}.mp4`)
  const info = await stopRecording(rec, out, { speed })
  console.log(`${id}: ${info.secs.toFixed(1)} s, ${info.fps.toFixed(1)} fps captured → ${out}`)
}

// ── Draft: a real recruit vs the bot ───────────────────────────────────
async function shootDraft() {
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), STATS: 'off' }, stdio: 'ignore',
  })
  try {
    await sleep(1500)
    const page = await newPage()
    const board = page.locator('[data-testid=board]').first()
    const attr = name => board.getAttribute(name).catch(() => '')
    const myTurn = async () => (await attr('data-my-turn')) === '1'
    const waitMyTurn = async () => { for (let i = 0; i < 200 && !(await myTurn()); i++) await sleep(100) }

    await page.goto(`http://localhost:${PORT}/`)
    await page.locator('[data-testid=menu-bot]').click()
    await page.getByRole('radio', { name: /White/ }).click()
    await page.locator('[data-testid=bot-start]').click()
    await page.locator('.mx-screen.recruit').waitFor()
    await sleep(600)

    const place = async (sq, type) => {
      await waitMyTurn()
      await sleep(500)
      await page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).click({ force: true })
      await page.locator('.pk-pop').waitFor()
      await sleep(450)
      if (type !== 'king') {
        await page.locator(`.pk-pop .pk-opt[data-piece-type="${type}"]`).click()
        await sleep(350)
      }
      await page.locator('[data-testid=recruit-confirm]').click()
      await sleep(500)
    }
    const card = async (id) => {
      await waitMyTurn()
      await sleep(500)
      await page.locator(`.mx-tray .cd-tile[data-card="${id}"]`).click()
      await page.locator('.cd-pop .cd-pop-main').waitFor()
      await sleep(500)
      await page.locator('.cd-pop .cd-pop-main').click()
      await sleep(500)
    }

    await record(page, 'draft', async () => {
      await sleep(700)
      await place('c1', 'king')
      await place('b1', 'knight')
      await card('meteor')
      await place('d1', 'bishop')
      await place('c2', 'pawn')
      // budget spent → recruit ends once the bot is done; film the hand-off to battle
      for (let i = 0; i < 100 && !(await page.locator('[data-testid=surrender-btn]').isVisible().catch(() => false)); i++) {
        if (await myTurn()) await page.locator('[data-testid=recruit-done]').click().catch(() => {})
        await sleep(150)
      }
      await sleep(2200)
    })
    await page.close()
  } finally {
    server.kill()
  }
}

// ── Battle moments: staged in the dev sandbox ─────────────────────────
async function shootSandbox(ids) {
  if (!ids.length) return
  const { createServer } = await import(pathToFileURL(path.join(CLIENT, 'node_modules/vite/dist/node/index.js')).href)
  const vite = await createServer({ root: CLIENT, configFile: path.join(CLIENT, 'vite.config.js'), server: { port: 0 }, logLevel: 'error' })
  await vite.listen()
  const base = vite.resolvedUrls.local[0].replace(/\/$/, '')
  try {
    for (const id of ids) {
      const shot = SANDBOX_SHOTS[id]
      const page = await newPage()
      await page.addInitScript(sc => { window.__clipScenario = sc }, shot.position)
      await page.addInitScript(slowMo, SLOW)
      await page.goto(`${base}/sandbox`)
      await page.waitForSelector('[data-testid=board]')
      await page.evaluate(() => document.fonts.ready)
      // CSS animations/transitions slow down too (JS time: see slowMo)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Animation.enable')
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW })
      // sandbox chrome → looks like the real game
      await page.addStyleTag({ content: '.mx-header, .mx-actions { visibility: hidden !important }' })
      await sleep(700)
      const cell = sq => page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).first()
      const wait = ms => sleep(ms * SLOW) // script pauses are in real-pace ms
      const a = {
        sleep: wait,
        // `promo`: piece to pick in the promotion picker (pawn reaching the far rank)
        async move(from, to, pause = 900, promo) {
          await cell(from).click({ force: true }); await wait(320)
          await cell(to).click({ force: true })
          if (promo) {
            await wait(450)
            await page.locator(`.pr-opt[data-promo="${promo}"]`).click({ force: true })
          }
          await wait(pause)
        },
        async card(cardId, target, pause = 1100) {
          if (DESKTOP) {
            await page.locator(`.cd-row[data-card="${cardId}"]`).first().click({ force: true }); await wait(600)
          } else {
            await page.locator(`.mx-tray .cd-tile[data-card="${cardId}"]`).first().click({ force: true }); await wait(420)
            await page.locator('.cd-pop .cd-pop-main').click({ force: true }); await wait(450)
          }
          await cell(target).click({ force: true }); await wait(pause)
        },
      }
      await record(page, id, async () => { await wait(500); await shot.play(a); await wait(shot.tail ?? 1200) }, SLOW)
      await cdp.detach().catch(() => {})
      await page.close()
    }
  } finally {
    await vite.close()
  }
}

try {
  if (want('draft')) await shootDraft()
  await shootSandbox(Object.keys(SANDBOX_SHOTS).filter(want))
} finally {
  await browser.close()
}
