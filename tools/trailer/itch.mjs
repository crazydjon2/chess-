// Store-page images (itch.io etc.) into tools/trailer/out/itch/:
//   cover.png        630×500 @2x (client/og.html?cover)
//   1-menu.png …     1280×720 @1.5x screenshots of the real game (English)
//   store-*.png      description section art (client/src/og/StoreArt.jsx)
//   node tools/trailer/itch.mjs            # everything
//   node tools/trailer/itch.mjs --store    # section art only
// Menu + recruit run against a local game server with the BUILT client
// (npm run build first); battle shots are staged in the dev sandbox.
import { chromium } from 'playwright-core'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CLIENT = path.join(ROOT, 'client')
const OUT = path.join(HERE, 'out', 'itch')
const VP = { width: 1280, height: 720 }, DPR = 1.5
const PORT = 4393
const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const LETTER = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' }
const army = (color, spec) => Object.fromEntries(spec.split(/\s+/).filter(Boolean).map(t => [t.slice(1), { type: LETTER[t[0]], color, hp: 1 }]))
const OPEN8 = { rows: 8, cols: 8, blockedCells: [] }

const browser = await chromium.launch({ channel: 'chrome' })
async function newPage(viewport = VP, dpr = DPR) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr })
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
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log(name) }

const { createServer } = await import(pathToFileURL(path.join(CLIENT, 'node_modules/vite/dist/node/index.js')).href)
const vite = await createServer({ root: CLIENT, configFile: path.join(CLIENT, 'vite.config.js'), server: { port: 0, fs: { allow: [ROOT] } }, logLevel: 'error' })
await vite.listen()
const base = vite.resolvedUrls.local[0].replace(/\/$/, '')
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), STATS: 'off' }, stdio: 'ignore',
})

// --store: only the description section art (needs the screenshots below)
async function storeArt() {
  const shots = `/@fs/${OUT.replace(/\\/g, '/')}/`
  for (const kind of ['how', 'cards']) {
    const page = await newPage({ width: 900, height: 600 }, 2)
    await page.goto(`${base}/og.html?store=${kind}&shots=${encodeURIComponent(shots)}`)
    await page.waitForSelector('[data-og-ready]')
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
    await sleep(300)
    await page.locator('.st').screenshot({ path: path.join(OUT, `store-${kind}.png`) })
    console.log(`store-${kind}.png`)
    await page.close()
  }
}

try {
  if (process.argv.includes('--store')) { await storeArt(); throw 'done' }
  // ── cover ──
  {
    const page = await newPage({ width: 630, height: 500 }, 2)
    await page.goto(`${base}/og.html?cover`)
    await page.waitForSelector('[data-og-ready]')
    await page.evaluate(() => document.fonts.ready)
    await sleep(300)
    await page.locator('.og').screenshot({ path: path.join(OUT, 'cover.png') })
    console.log('cover.png')
    await page.close()
  }

  // ── staged battles in the sandbox ──
  const sandbox = async (position, play, name) => {
    const page = await newPage()
    await page.addInitScript(sc => { window.__clipScenario = sc }, position)
    await page.goto(`${base}/sandbox`)
    await page.waitForSelector('[data-testid=board]')
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({ content: '.mx-actions { visibility: hidden !important }' })
    await sleep(600)
    const cell = sq => page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).first()
    const a = {
      sleep,
      async move(from, to, pause = 900) { await cell(from).click({ force: true }); await sleep(300); await cell(to).click({ force: true }); await sleep(pause) },
      async select(sq) { await cell(sq).click({ force: true }); await sleep(400) },
      async card(id, target, pause = 2200) {
        const tile = page.locator(`.cd-row[data-card="${id}"], .mx-tray .cd-tile[data-card="${id}"]`).first()
        await tile.click({ force: true }); await sleep(400)
        const main = page.locator('.cd-pop .cd-pop-main, .cd-row .cd-use, [data-testid=use-card]').first()
        if (await main.isVisible().catch(() => false)) { await main.click({ force: true }); await sleep(400) }
        await cell(target).click({ force: true }); await sleep(pause)
      },
    }
    await play(a)
    // the sandbox's own pill → what a real match shows
    await page.evaluate(() => { const p = document.querySelector('.mx-pill'); if (p) p.innerHTML = '<span class="mx-pill-off">Recruit</span><span class="mx-pill-sep">›</span><span class="mx-pill-on">Battle</span>' })
    if (name) await shot(page, name)
    await page.close()
  }

  const midgame = {
    board: OPEN8,
    white: army('white', 'Kg1 Qd1 Rf1 Ra1 Bc4 Nf3 Pa2 Pb2 Pc3 Pf2 Pg2 Ph3 Pe4'),
    black: army('black', 'Kg8 Qd8 Rf8 Ra8 Bc8 Nc6 Pa7 Pb7 Pf7 Pg7 Ph6 Pe5 Pd6'),
    cards: { white: ['meteor', 'shield', 'freeze', 'unstable'], black: ['smoke_screen', 'barricade', 'add_cell'] },
  }
  // 2: battle — meteor incoming on the black queen, shielded rook, a piece selected
  await sandbox(midgame, async a => {
    await a.card('meteor', 'd8')
    await a.move('a2', 'a3')
    await a.card('barricade', 'd5')
    await a.move('c8', 'g4')
    await a.card('shield', 'f1')
    await a.select('f3')
  }, '3-battle.png')
  // 3: the card slam mid-flight
  await sandbox(midgame, async a => {
    await a.card('unstable', 'd8', 650)
  }, '4-card.png')

  // ── menu + recruit vs the bot ──
  await sleep(500)
  {
    const page = await newPage()
    await page.goto(`http://localhost:${PORT}/`)
    await page.waitForSelector('[data-testid=menu-bot]')
    await page.evaluate(() => document.fonts.ready)
    await sleep(900)
    await shot(page, '1-menu.png')
    const board = page.locator('[data-testid=board]').first()
    const myTurn = async () => (await board.getAttribute('data-my-turn').catch(() => '')) === '1'
    const waitMyTurn = async () => { for (let i = 0; i < 200 && !(await myTurn()); i++) await sleep(100) }
    await page.locator('[data-testid=menu-bot]').click()
    await page.getByRole('radio', { name: /White/ }).click()
    await page.locator('[data-testid=bot-start]').click()
    await page.locator('.mx-screen.recruit').waitFor()
    const place = async (sq, type) => {
      await waitMyTurn(); await sleep(300)
      await page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).click({ force: true })
      await page.locator('.pk-pop').waitFor(); await sleep(250)
      if (type !== 'king') { await page.locator(`.pk-pop .pk-opt[data-piece-type="${type}"]`).click(); await sleep(200) }
      await page.locator('[data-testid=recruit-confirm]').click(); await sleep(400)
    }
    await place('d1', 'king')
    await place('c1', 'rook')
    await waitMyTurn(); await sleep(300)
    await place('e2', 'pawn')
    await waitMyTurn(); await sleep(300)
    await page.locator('[data-testid=board] .bd-cell[data-square="b2"]').click({ force: true })
    await page.locator('.pk-pop').waitFor(); await sleep(250)
    await page.locator('.pk-pop .pk-opt[data-piece-type="knight"]').click(); await sleep(500)
    await shot(page, '2-recruit.png')
    await page.close()
  }
  await storeArt()
} catch (e) {
  if (e !== 'done') throw e
} finally {
  server.kill()
  await browser.close()
  await vite.close()
}
