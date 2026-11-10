#!/usr/bin/env node
// Screenshot atlas: walks every screen and UI state on the three main
// resolutions (desktop, tablet, phone) and saves them plus an index.html.
// Lets a redesign start from a full picture of the UI and be compared after.
//
//   node tools/ui-e2e/screens.js                 # all three resolutions
//   node tools/ui-e2e/screens.js --only mobile   # one of desktop|tablet|mobile
//   node tools/ui-e2e/screens.js --no-build      # reuse client/dist
//   node tools/ui-e2e/screens.js --out before    # reports/screens/before/
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildClient, startServer, launchBrowser, Recorder, PROFILES, newPage, sleep } from './lib/harness.js'
import * as A from './lib/actions.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = k => args.includes('--' + k)
const val = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null }

const MAIN_PROFILES = ['desktop', 'tablet', 'mobile']
const OUT = path.join(HERE, 'reports', 'screens', val('out') ?? 'latest')
// One resolution's shots, numbered in the order a player meets them.
class Atlas {
  constructor(profile) {
    this.profile = profile
    this.dir = path.join(OUT, profile)
    this.shots = []
    this.missed = []
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
  }
  async shot(page, group, name, { settle = 600 } = {}) {
    await sleep(settle)
    const file = `${String(this.shots.length + 1).padStart(2, '0')}-${name.replace(/[^\wа-яё-]+/gi, '_')}.png`
    await page.screenshot({ path: path.join(this.dir, file) })
    this.shots.push({ group, name, file })
    console.log(`    ${file}`)
  }
  // A state that didn't come up must not cost the rest of the walk.
  async attempt(name, fn) {
    try { await fn() } catch (e) {
      this.missed.push({ name, why: String(e?.message ?? e).split('\n')[0] })
      console.log(`    ✗ ${name}: ${String(e?.message ?? e).split('\n')[0]}`)
    }
  }
}

const tray = page => A.isTrayLayout(page)
const boardTargets = async (page, attr = 'data-targets') => ((await page.locator('[data-testid=board]').first().getAttribute(attr)) ?? '').split(' ').filter(Boolean)

// Selects one of my pieces that has a move, leaving it selected.
async function selectMovable(page) {
  const color = await A.myColor(page)
  const mine = await page.locator(`[data-testid=board] .bd-piece[data-piece^="${color}-"]`).evaluateAll(els => els.map(e => e.getAttribute('data-square')))
  for (const sq of mine) {
    await A.clickSquare(page, sq)
    if ((await boardTargets(page)).length) return sq
  }
  throw new Error('нет фигуры с ходом')
}

async function waitForTurn(a, b) {
  for (let i = 0; i < 100; i++) {
    if (await A.myBattleTurn(a)) return a
    if (await A.myBattleTurn(b)) return b
    await sleep(100)
  }
  throw new Error('ни у кого нет хода')
}

async function menuScreens(browser, base, atlas, rec) {
  const page = await newPage(browser, atlas.profile, rec, 'menu')
  await page.goto(base + '/')
  await page.locator('[data-testid=menu-online]').waitFor()
  await atlas.shot(page, 'Меню', 'главное меню')
  await atlas.attempt('как играть', async () => {
    await page.locator('[data-testid=menu-howto]').click()
    const tabs = page.locator('.htp-tabs button')
    await atlas.shot(page, 'Меню', 'как играть · партия')
    await tabs.nth(1).click(); await page.locator('.ui-overlay:not(.leaving) .htp-card').nth(2).click()
    await atlas.shot(page, 'Меню', 'как играть · карты')
    await tabs.nth(2).click()
    await atlas.shot(page, 'Меню', 'как играть · доски')
    await page.locator('.htp-head .ui-btn').click()
  })
  await atlas.attempt('настройки', async () => {
    await page.locator('.mm-top .ui-btn').click()
    await atlas.shot(page, 'Меню', 'настройки')
    await page.locator('.ui-overlay:not(.leaving) .set-lang-btn').click()
    await atlas.shot(page, 'Меню', 'настройки · язык')
    await page.locator('.ui-overlay:not(.leaving) .set-lang-btn').click()
    await page.locator('.set-card .ui-modal-close').click()
  })
  await atlas.attempt('что нового', async () => {
    await page.locator('[data-testid=menu-news]').click()
    await atlas.shot(page, 'Меню', 'что нового')
    await page.locator('.pn-head .ui-btn').click()
  })
  await atlas.attempt('против ИИ', async () => {
    await page.locator('[data-testid=menu-bot]').click()
    await atlas.shot(page, 'Меню', 'против ИИ · выбор')
  })
  await page.context().close()
}

async function sandboxScreens(browser, base, atlas, rec) {
  const page = await newPage(browser, atlas.profile, rec, 'sandbox')
  await page.goto(base + '/sandbox')
  await page.locator('[data-testid=board]').waitFor()
  await atlas.shot(page, 'Песочница', 'песочница')
  await atlas.attempt('карта: цели', async () => {
    const t = await tray(page)
    await page.locator(t ? '.mx-tray .cd-tile[data-card=smoke_screen]' : '.mx-right .cd-panel.grow .cd-row[data-card=smoke_screen]').click()
    if (t) { await atlas.shot(page, 'Песочница', 'карта · всплывашка'); await page.locator('.cd-pop-main').click() }
    await atlas.shot(page, 'Песочница', 'карта · цели на доске')
    await page.locator('[data-testid=board] .bd-cell[data-square="e2"]').click({ force: true })
    await atlas.shot(page, 'Песочница', 'карта · заставка', { settle: 350 })
    await atlas.shot(page, 'Песочница', 'дымовая завеса', { settle: 1800 })
  })
  await atlas.attempt('превращение', async () => {
    await A.clickSquare(page, 'g7')
    const tg = await boardTargets(page)
    const to = tg.find(s => s.endsWith('8'))
    if (!to) throw new Error('пешке g7 некуда идти')
    await page.locator(`[data-testid=board] .bd-cell[data-square="${to}"]`).click({ force: true })
    await page.locator('[data-promo]').first().waitFor({ timeout: 3000 })
    await atlas.shot(page, 'Песочница', 'превращение пешки')
    await page.locator('[data-promo=queen]').click()
  })
  await atlas.attempt('журнал', async () => {
    const j = await A.journal(page)
    await atlas.shot(page, 'Песочница', 'журнал')
    await j.locator('.jr-row.btn:not(.group)').first().click()
    await atlas.shot(page, 'Песочница', 'журнал · просмотр истории')
    await page.locator('.bt-history-back').click()
  })
  await page.context().close()
}

async function lobbyScreens(browser, base, atlas, rec, a, b) {
  await A.openOnline(a, base, 'Алиса')
  await atlas.shot(a, 'Лобби', 'игра по сети')
  await a.locator('[data-testid=code-input]').fill('3BN')
  await atlas.shot(a, 'Лобби', 'ввод кода')
  await a.locator('[data-testid=code-input]').fill('')
  await a.locator('[data-testid=create-lobby]').click()
  await atlas.shot(a, 'Лобби', 'новое лобби')
  await a.locator('.po-modal-x').click()
  const code = await A.createRoom(a, { visibility: 'public', color: 'random' })
  await atlas.shot(a, 'Лобби', 'ожидание соперника')
  await A.openOnline(b, base, 'Борис')
  await atlas.shot(b, 'Лобби', 'список с открытым лобби')
  await A.joinFromList(b, code)
  await a.locator('[data-testid=start-game]').waitFor()
  await atlas.shot(a, 'Лобби', 'соперник зашёл')
  await A.startMatch(a)
  await a.locator('.mx-screen.recruit').waitFor()
}

// Recruit: the first player opens the picker, the second the card shop; then
// both buy a few things and finish.
async function recruitScreens(atlas, a, b, rng, { shots = true } = {}) {
  const mover = async () => {
    for (let i = 0; i < 60; i++) {
      if (await A.myRecruitTurn(a)) return a
      if (await A.myRecruitTurn(b)) return b
      await sleep(100)
    }
    return null
  }
  let p = await mover()
  if (shots && p) {
    await atlas.shot(p, 'Набор', 'набор · твой ход')
    const other = p === a ? b : a
    await atlas.shot(other, 'Набор', 'набор · ход соперника')
    const free = await boardTargets(p)
    await p.locator(`[data-testid=board] .bd-cell[data-square="${free[0]}"]`).click({ force: true })
    await p.locator('.pk-pop').waitFor()
    await atlas.shot(p, 'Набор', 'набор · выбор фигуры над клеткой')
    await p.locator('[data-testid=recruit-confirm]').click()
    p = await mover()
    const t = await tray(p)
    await p.locator(t ? '.mx-tray .cd-tile:not(.off)' : '.mx-right .cd-row:not(.off)').first().click()
    await atlas.shot(p, 'Набор', 'набор · покупка карты')
    await p.locator(t ? '.cd-pop-main' : '[data-testid=buy-card]').first().click()
  }
  for (let i = 0; i < 40; i++) {
    if (await A.onBattle(a) && await A.onBattle(b)) break
    p = await mover()
    if (!p) break
    const picks = Number(await p.locator('.jr-row').count())
    await A.recruitStep(p, rng, { preferDone: picks > 8 ? 0.6 : 0 })
    await sleep(120)
  }
  await a.locator('[data-testid=surrender-btn]').waitFor({ timeout: 15000 })
}

async function battleScreens(atlas, a, b, rng) {
  let p = await waitForTurn(a, b)
  await atlas.shot(p, 'Бой', 'бой · твой ход')
  await atlas.shot(p === a ? b : a, 'Бой', 'бой · ход соперника')
  await atlas.attempt('выбор фигуры', async () => {
    await selectMovable(p)
    await atlas.shot(p, 'Бой', 'бой · выбрана фигура', { settle: 300 })
    await A.makeMove(p, rng)
  })
  p = await waitForTurn(a, b)
  await atlas.attempt('карта', async () => {
    const t = await tray(p)
    const card = p.locator(t ? '.mx-tray .cd-tile:not(.off)' : '.mx-right .cd-panel.grow .cd-row:not(.off)').first()
    if (!(await card.count())) throw new Error('нет карт в руке')
    await card.click()
    if (t) await p.locator('.cd-pop-main').click()
    await atlas.shot(p, 'Бой', 'бой · выбрана карта', { settle: 300 })
    const tg = await boardTargets(p, 'data-card-targets')
    if (tg.length) {
      await p.locator(`[data-testid=board] .bd-cell[data-square="${tg[0]}"]`).first().click({ force: true })
      await atlas.shot(p === a ? b : a, 'Бой', 'бой · карта соперника', { settle: 400 })
    }
  })
  await atlas.attempt('ничья', async () => {
    const q = await waitForTurn(a, b)
    await q.locator('[data-testid=draw-btn]').click()
    await atlas.shot(q, 'Окна боя', 'предложить ничью?')
    await q.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn.primary').click()
    const other = q === a ? b : a
    await other.locator('.mx-banner').waitFor()
    await atlas.shot(other, 'Окна боя', 'соперник предлагает ничью')
    await other.locator('.mx-banner .ui-btn:not(.primary)').click()
  })
  await atlas.attempt('сдаться', async () => {
    await a.locator('[data-testid=surrender-btn]').click()
    await atlas.shot(a, 'Окна боя', 'сдаться?')
    await a.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn.danger').click()
  })
}

async function matchScreens(browser, base, atlas, rec, rng) {
  const a = await newPage(browser, atlas.profile, rec, 'A')
  const b = await newPage(browser, atlas.profile, rec, 'B')
  await lobbyScreens(browser, base, atlas, rec, a, b)
  await recruitScreens(atlas, a, b, rng)
  await battleScreens(atlas, a, b, rng)
  await a.locator('[data-testid=result-primary]').waitFor()
  await atlas.shot(a, 'Итоги', 'итог раунда')
  await a.locator('[data-testid=result-primary]').click()
  await b.locator('[data-testid=result-primary]').click()
  await recruitScreens(atlas, a, b, rng, { shots: false })
  await a.locator('[data-testid=surrender-btn]').click()
  await a.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn.danger').click()
  await a.locator('.ui-overlay:not(.leaving) .rs-card').waitFor()
  await sleep(600)
  const finalOver = !/раунд/i.test(await a.locator('[data-testid=result-primary]').innerText())
  if (finalOver) {
    await atlas.shot(a, 'Итоги', 'матч · поражение')
    await atlas.shot(b, 'Итоги', 'матч · победа')
  }
  await a.context().close(); await b.context().close()
}

function writeIndex(atlases) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const groups = new Map()
  for (const at of atlases) {
    for (const s of at.shots) {
      if (!groups.has(s.group)) groups.set(s.group, new Map())
      const g = groups.get(s.group)
      if (!g.has(s.name)) g.set(s.name, {})
      g.get(s.name)[at.profile] = `${at.profile}/${s.file}`
    }
  }
  const size = p => `${PROFILES[p].viewport.width}×${PROFILES[p].viewport.height}`
  const body = [...groups].map(([group, screens]) => `<h2>${esc(group)}</h2>${[...screens].map(([name, files]) => `
    <section><h3>${esc(name)}</h3><div class="row">${atlases.map(at => files[at.profile]
      ? `<a href="${esc(files[at.profile])}" target="_blank"><img loading="lazy" src="${esc(files[at.profile])}" class="${at.profile}" alt="${esc(name)} ${at.profile}"><span>${at.profile} ${size(at.profile)}</span></a>`
      : `<div class="none">нет на ${at.profile}</div>`).join('')}</div></section>`).join('')}`).join('')
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Экраны Chess+</title><style>
body{font:14px system-ui;margin:24px;background:#f4f1ea;color:#241708}h2{margin:32px 0 8px;border-bottom:2px solid #241708}h3{margin:18px 0 6px;font-weight:600}
.row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}a{color:inherit;text-decoration:none;display:block}a span{display:block;font-size:12px;color:#7a6a55;margin-top:4px}
img{display:block;border:1px solid #bbb;background:#fff}img.desktop{width:560px}img.tablet{width:260px}img.mobile{width:170px}.none{color:#7a6a55;padding:12px}
</style></head><body><h1>Экраны Chess+</h1>${body}</body></html>`)
}

async function main() {
  const only = val('only')
  const profiles = only ? [only] : MAIN_PROFILES
  if (only && !PROFILES[only]) throw new Error('Неизвестное разрешение: ' + only)
  const port = Number(val('port') ?? 4318)
  fs.mkdirSync(OUT, { recursive: true })

  if (!flag('no-build')) { process.stdout.write('Сборка клиента… '); buildClient(); console.log('готово') }
  const server = await startServer(port)
  const browser = await launchBrowser({ headed: flag('headed') })
  const rng = () => Math.random()
  const atlases = []
  try {
    for (const profile of profiles) {
      console.log(`\n${profile}:`)
      const atlas = new Atlas(profile)
      atlases.push(atlas)
      const rec = new Recorder(path.join(OUT, '.rec'))
      for (const [name, fn] of [
        ['меню', () => menuScreens(browser, server.url, atlas, rec)],
        ['матч', () => matchScreens(browser, server.url, atlas, rec, rng)],
        ['песочница', () => sandboxScreens(browser, server.url, atlas, rec)],
      ]) await atlas.attempt(name, fn)
    }
  } finally {
    await browser.close()
    server.proc.kill()
    fs.rmSync(path.join(OUT, '.rec'), { recursive: true, force: true })
  }

  writeIndex(atlases)
  console.log('')
  for (const at of atlases) {
    console.log(`${at.profile}: ${at.shots.length} экранов${at.missed.length ? `, не снято ${at.missed.length}:` : ''}`)
    for (const m of at.missed) console.log(`  ✗ ${m.name}: ${m.why}`)
  }
  console.log('Атлас:', path.join(OUT, 'index.html'))
  process.exit(atlases.some(at => at.missed.length) ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
