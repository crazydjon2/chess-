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
// What each player buys, so the board has a real army and every threat
// indicator comes up. B stops with coins left and presses "done" by hand.
const DRAFT_PLANS = {
  A: [/Метеор/, /Мина/, /Конь/, /Пешка/],
  B: [/Дымовая/, /Конь/],
}

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

const isPhone = page => A.isPhoneLayout(page)

async function closeDrawer(page) {
  if (await A.visible(page, '.sd-panel-close')) {
    await page.locator('.sd-panel-close').click()
    await page.locator('.sd-backdrop').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {})
  }
}

async function squares(page) {
  const list = await page.locator('[data-testid=board] rect[data-piece]').evaluateAll(els => els.map(e => [e.getAttribute('data-square'), e.getAttribute('data-piece')]))
  return new Map(list)
}

const clickSquare = (page, sq) => page.locator(`[data-testid=board] rect[data-square="${sq}"]`).first().click({ force: true, timeout: 3000 })
const boardTargets = async (page, attr = 'data-targets') => ((await page.locator('[data-testid=board]').first().getAttribute(attr)) ?? '').split(' ').filter(Boolean)

async function myColor(page) {
  return page.evaluate(() => {
    const tag = document.querySelector('.player-panel.mine .player-color-tag')
    return tag ? (tag.className.includes('p-white') ? 'white' : 'black') : null
  })
}

// Selects one of my pieces that has a quiet move, leaving it selected.
// Quiet on purpose: a stray capture could end the round mid-walk.
async function selectMovable(page) {
  const color = await myColor(page)
  const board = await squares(page)
  for (const [sq, piece] of board) {
    if (color && !piece.startsWith(color + '-')) continue
    await clickSquare(page, sq)
    const to = (await boardTargets(page)).find(t => !board.has(t))
    if (to) return { from: sq, to }
    await clickSquare(page, sq).catch(() => {})
  }
  return null
}

async function quietMove(page) {
  const m = await selectMovable(page)
  if (!m) return false
  await clickSquare(page, m.to)
  await sleep(250)
  return true
}

const mover = async (a, b) => (await A.myBattleTurn(a)) ? [a, b] : [b, a]

async function waitForTurn(a, b) {
  for (let i = 0; i < 60; i++) {
    if (await A.myBattleTurn(a) || await A.myBattleTurn(b)) return mover(a, b)
    await sleep(100)
  }
  throw new Error('никто не ходит')
}

// Opens the hand and picks a card by name; leaves it armed for targeting.
async function armCard(page, nameRe) {
  const phone = await isPhone(page)
  if (phone) {
    await page.locator('.sd-trigger:not(.sd-trigger-cancel)').first().click({ timeout: 2000 })
    await page.locator('.sd-panel .gc-card').first().waitFor({ state: 'visible', timeout: 2500 })
  }
  const card = page.locator(phone ? '.sd-panel .gc-card:not(.gc-disabled)' : '.card-hand .gc-card:not(.gc-disabled)').filter({ hasText: nameRe }).first()
  if (!(await card.count())) { await closeDrawer(page); return false }
  await card.click({ timeout: 2000 })
  if (phone) await page.locator('.sd-backdrop').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {})
  await sleep(100)
  return true
}

async function cancelCard(page) {
  if (await isPhone(page)) await page.locator('.sd-trigger-cancel').click({ timeout: 2000 }).catch(() => {})
  else await page.locator('.card-hand .gc-card.gc-selected').first().click({ timeout: 2000 }).catch(() => {})
}

// ── Menu and its windows ──────────────────────────────────────────────
async function menuScreens(browser, base, atlas, rec) {
  const G = 'Меню'
  const page = await newPage(browser, atlas.profile, rec, 'menu')
  await page.goto(base + '/')
  await page.locator('.mm-hero').waitFor({ timeout: 10000 })
  await atlas.shot(page, G, 'главное-меню', { settle: 1000 })

  await atlas.attempt('как играть', async () => {
    await page.locator('.mm-card-howto').click()
    const tabs = page.locator('.htp-tab')
    for (let i = 0; i < await tabs.count(); i++) {
      await tabs.nth(i).click()
      const label = (await tabs.nth(i).innerText()).trim().toLowerCase()
      await atlas.shot(page, G, `как-играть-${i + 1}-${label}`, { settle: 350 })
    }
    await page.locator('.htp-close').click()
  })
  await atlas.attempt('что нового', async () => {
    await page.locator('.mm-card-patchnotes').click()
    await atlas.shot(page, G, 'что-нового')
    await page.locator('.pn-close').click()
  })
  await atlas.attempt('настройки', async () => {
    await page.locator('.ml-settings-btn').click()
    await atlas.shot(page, G, 'настройки')
    await page.locator('.set-close').click()
  })
  await page.context().close()
}

// ── Sandbox: the only place a promotion and a finished hot-seat game are
//    reachable on demand ──────────────────────────────────────────────
async function sandboxScreens(browser, base, atlas, rec) {
  const G = 'Песочница'
  const page = await newPage(browser, atlas.profile, rec, 'sandbox')
  await page.goto(base + '/sandbox')
  await page.locator('[data-testid=board]').waitFor({ timeout: 10000 })
  await atlas.shot(page, G, 'песочница', { settle: 1000 })

  await atlas.attempt('превращение пешки', async () => {
    await clickSquare(page, 'g7')
    const to = (await boardTargets(page))[0]
    if (!to) throw new Error('у пешки g7 нет ходов')
    await clickSquare(page, to)
    await page.locator('.promo-btn').first().waitFor({ timeout: 3000 })
    await atlas.shot(page, G, 'превращение-пешки')
    await page.locator('.promo-btn').first().click()
  })

  await atlas.attempt('конец партии', async () => {
    for (let i = 0; i < 80 && !(await A.visible(page, '.result-overlay')); i++) {
      const board = await squares(page)
      let moved = false
      for (const [sq, piece] of [...board].sort(() => Math.random() - 0.5)) {
        await clickSquare(page, sq).catch(() => {})
        const targets = await boardTargets(page).catch(() => [])
        if (!targets.length) continue
        const color = piece.split('-')[0]
        const enemy = t => board.has(t) && !board.get(t).startsWith(color)
        const to = targets.find(t => enemy(t) && board.get(t).endsWith('king')) ?? targets.find(enemy) ?? targets[0]
        await clickSquare(page, to)
        if (await A.visible(page, '.promo-btn')) await page.locator('.promo-btn').first().click()
        moved = true
        break
      }
      if (!moved) break
      await sleep(60)
    }
    await page.locator('.result-overlay').waitFor({ timeout: 1500 })
    await atlas.shot(page, G, 'конец-партии', { settle: 900 })
  })
  await page.context().close()
}

// ── Online lobby ──────────────────────────────────────────────────────
async function lobbyScreens(browser, base, atlas, rec, a, b) {
  const G = 'Лобби'
  await A.openOnline(a, base, 'Алиса')
  await atlas.shot(a, G, 'онлайн-пустой-список', { settle: 900 })

  await atlas.attempt('окно создания лобби', async () => {
    await a.locator('.po-create-btn').first().click()
    await atlas.shot(a, G, 'окно-создания-лобби')
    await a.locator('.po-modal-close').click()
  })
  await atlas.attempt('окно игры с ИИ', async () => {
    await a.locator('.po-bot-btn').click()
    await atlas.shot(a, G, 'окно-игры-с-ИИ')
    await a.locator('.po-modal-close').click()
  })

  const code = await A.createRoom(a, { visibility: 'public', color: 'white' })
  await atlas.shot(a, G, 'ожидание-хост-один', { settle: 900 })

  // A second open room, so the browser shows a real list.
  const c = await newPage(browser, atlas.profile, rec, 'C')
  await A.openOnline(c, base, 'Вика')
  await A.createRoom(c, { visibility: 'public', color: 'black' })

  await A.openOnline(b, base, 'Борис')
  await b.locator('.po-room').nth(1).waitFor({ timeout: 8000 }).catch(() => {})
  await atlas.shot(b, G, 'онлайн-список-комнат')

  await atlas.attempt('ошибка входа по коду', async () => {
    await b.locator('.po-code-input').fill('ZZZZZ')
    await b.locator('.po-code-btn').click()
    await b.locator('.game-toast, .po-error').first().waitFor({ timeout: 3000 })
    await atlas.shot(b, G, 'онлайн-ошибка-кода', { settle: 200 })
    await b.locator('.po-code-input').fill('')
  })

  await A.joinFromList(b, code)
  await a.waitForFunction(() => !document.querySelector('.wr-start-btn')?.disabled, null, { timeout: 8000 })
  await atlas.shot(a, G, 'ожидание-хост-готов')
  await atlas.shot(b, G, 'ожидание-гость', { settle: 0 })
  await c.context().close()

  await A.startMatch(a)
  await a.locator('.dr-catalog').waitFor({ timeout: 10000 })
  await b.locator('.dr-catalog').waitFor({ timeout: 10000 })
}

// ── Draft ─────────────────────────────────────────────────────────────
// Next affordable item of this player's plan; false once the plan is spent.
async function pickFromPlan(page, plan) {
  while (plan.length) {
    const tile = page.locator('.dr-catalog .gc-card:not(.gc-disabled)').filter({ hasText: plan.shift() }).first()
    if (!(await tile.count())) continue
    await tile.scrollIntoViewIfNeeded().catch(() => {})
    await tile.click({ timeout: 2000 })
    return true
  }
  return false
}

async function draftScreens(atlas, a, b, { shots = true } = {}) {
  const G = 'Драфт'
  if (shots) {
    await sleep(500)
    const [me, opp] = (await A.myDraftTurn(a)) ? [a, b] : [b, a]
    await atlas.shot(me, G, 'драфт-мой-ход')
    await atlas.shot(opp, G, 'драфт-ход-соперника', { settle: 0 })
    await atlas.attempt('подсказка карты', async () => {
      const help = me.locator('.dr-card-grid .gc-help').first()
      await help.scrollIntoViewIfNeeded()
      await help.hover({ timeout: 2000 })
      await atlas.shot(me, G, 'драфт-подсказка-карты', { settle: 250 })
      await me.mouse.move(0, 0)
    })
    await atlas.attempt('каталог прокручен к картам', async () => {
      await me.locator('.dr-catalog-scroll').evaluate(el => el.scrollTo(0, el.scrollHeight))
      await atlas.shot(me, G, 'драфт-каталог-низ', { settle: 250 })
      await me.locator('.dr-catalog-scroll').evaluate(el => el.scrollTo(0, 0))
    })
  }

  const plans = new Map([a, b].map(p => [p, [...DRAFT_PLANS[p.label]]]))
  let picks = 0, midShot = !shots, doneShot = !shots
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    if (await A.onPlacement(a) && await A.onPlacement(b)) return
    for (const p of [a, b]) {
      if (!(await A.onDraft(p)) || !(await A.myDraftTurn(p))) continue
      if (await pickFromPlan(p, plans.get(p))) {
        await sleep(150)
        if (!midShot && ++picks === 3) { midShot = true; await atlas.shot(p, G, 'драфт-с-покупками', { settle: 300 }) }
        continue
      }
      const done = p.locator('.dr-tray-done-btn')
      if (await done.isEnabled().catch(() => false)) {
        await done.click()
        await sleep(200)
        if (!doneShot) { doneShot = true; await atlas.shot(p, G, 'драфт-игрок-готов', { settle: 300 }) }
      }
    }
    await sleep(60)
  }
  throw new Error('драфт не закончился за 90 с')
}

// ── Placement (30 s shared clock — short settles) ────────────────────
async function placementScreens(atlas, a, b, rng, { shots = true } = {}) {
  const G = 'Расстановка'
  await a.locator('.pl-board').waitFor({ timeout: 10000 })
  await b.locator('.pl-board').waitFor({ timeout: 10000 })
  if (shots) {
    await atlas.shot(a, G, 'расстановка-пустая', { settle: 500 })
    await atlas.attempt('панель фигур и выбор', async () => {
      if (await isPhone(a)) {
        await a.locator('.sd-trigger:not(.sd-trigger-cancel)').first().click({ timeout: 2000 })
        await a.locator('.sd-panel .gc-card').first().waitFor({ state: 'visible', timeout: 2500 })
        await atlas.shot(a, G, 'расстановка-панель-фигур', { settle: 350 })
        await a.locator('.sd-panel .gc-card:not(.gc-disabled)').first().click()
        await a.locator('.sd-backdrop').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {})
      } else await a.locator('.pl-piece-rail .gc-card:not(.gc-disabled)').first().click({ timeout: 2000 })
      await atlas.shot(a, G, 'расстановка-фигура-выбрана', { settle: 200 })
      const cells = a.locator('.pl-cell.mine:not(.occupied)')
      await cells.nth(Math.floor(rng() * await cells.count())).click({ timeout: 2000 })
    })
  }
  await A.placeAll(a, rng)
  if (shots) {
    await atlas.shot(b, G, 'расстановка-видно-соперника', { settle: 250 })
    await atlas.shot(a, G, 'расстановка-всё-расставлено', { settle: 0 })
  }
  await a.locator('.pl-submit-btn').click({ timeout: 2000 })
  if (shots) await atlas.shot(a, G, 'расстановка-ждём-соперника', { settle: 250 })
  await A.placeAll(b, rng)
  if (shots) await atlas.shot(b, G, 'расстановка-соперник-готов', { settle: 150 })
  await b.locator('.pl-submit-btn').click({ timeout: 2000 })
  await a.locator('[data-testid=board]').waitFor({ timeout: 40000 })
  await b.locator('[data-testid=board]').waitFor({ timeout: 40000 })
  await sleep(700)
}

// ── Battle ────────────────────────────────────────────────────────────
// Cards first: the opponent's view of each is a state of its own (toast,
// threat badge, fog).
async function playCardFor(atlas, page, viewer, nameRe, label) {
  if (!(await armCard(page, nameRe))) return false
  const targets = await boardTargets(page, 'data-card-targets')
  if (!targets.length) { await cancelCard(page); return false }
  await clickSquare(page, targets[Math.floor(targets.length / 2)])
  await atlas.shot(viewer, 'Бой', `бой-соперник-сыграл-${label}`, { settle: 250 })
  return true
}

async function battleScreens(atlas, a, b) {
  const G = 'Бой'
  let [me, opp] = await waitForTurn(a, b)
  await atlas.shot(me, G, 'бой-мой-ход')
  await atlas.shot(opp, G, 'бой-ход-соперника', { settle: 0 })

  await atlas.attempt('выбор фигуры', async () => {
    const m = await selectMovable(me)
    if (!m) throw new Error('нет ходов')
    await atlas.shot(me, G, 'бой-фигура-выбрана', { settle: 200 })
    await clickSquare(me, m.from).catch(() => {})
  })

  await atlas.attempt('рука карт', async () => {
    if (await isPhone(me)) {
      await me.locator('.sd-trigger:not(.sd-trigger-cancel)').first().click({ timeout: 2000 })
      await me.locator('.sd-panel .gc-card').first().waitFor({ state: 'visible', timeout: 2500 })
      await atlas.shot(me, G, 'бой-панель-карт', { settle: 400 })
      await closeDrawer(me)
    }
    if (!(await armCard(me, /./))) throw new Error('нет карт')
    await atlas.shot(me, G, 'бой-карта-выбрана-цели', { settle: 250 })
    await cancelCard(me)
  })

  // Each side plays one threat per turn, so both views of it get captured.
  const played = new Set()
  for (let ply = 0; ply < 8; ply++) {
    ;[me, opp] = await waitForTurn(a, b)
    for (const [re, label] of [[/Метеор/, 'метеор'], [/Мина/, 'мина'], [/Дымовая/, 'дым']]) {
      if (played.has(label)) continue
      const ok = await playCardFor(atlas, me, opp, re, label).catch(() => false)
      if (ok) { played.add(label); await atlas.shot(me, G, `бой-я-сыграл-${label}`, { settle: 0 }) }
      if (ok) break
    }
    if (!(await quietMove(me))) break
    await sleep(300)
    if (ply === 1) await atlas.shot(opp, G, 'бой-последний-ход-подсвечен', { settle: 100 })
    if (played.size >= 3 && ply >= 3) break
  }

  await atlas.attempt('предход', async () => {
    ;[me, opp] = await waitForTurn(a, b)
    const m = await selectMovable(opp)
    if (!m) throw new Error('нет ходов')
    await clickSquare(opp, m.to)
    await atlas.shot(opp, G, 'бой-предход', { settle: 200 })
    await opp.locator('[data-testid=board]').first().click({ button: 'right', timeout: 1000 }).catch(() => {})
  })

  await atlas.attempt('журнал', async () => {
    await me.locator('.bt-log-btn').click()
    await me.locator('.bl-entry').first().waitFor({ timeout: 3000 })
    await atlas.shot(me, G, 'бой-журнал')
    await me.locator('.bl-entry').nth(0).click()
    await atlas.shot(me, G, 'бой-журнал-история', { settle: 300 })
    await me.locator('.bl-return').click({ timeout: 2000 })
    await me.locator('.bl-close').click({ timeout: 2000 })
    await sleep(250)
  })

  await atlas.attempt('подтверждение сдачи', async () => {
    await me.locator('.surrender-btn').click({ timeout: 2000 })
    await me.locator('.confirm-overlay').waitFor({ timeout: 2000 })
    await atlas.shot(me, G, 'окно-сдаться')
    await me.locator('.confirm-btn.cancel').click()
  })

  await atlas.attempt('предложение ничьей', async () => {
    ;[me, opp] = await waitForTurn(a, b)
    await opp.locator('.draw-btn').click({ timeout: 2000 })
    await me.locator('.confirm-overlay').waitFor({ timeout: 4000 })
    await atlas.shot(me, G, 'окно-предложена-ничья')
    await me.locator('.confirm-btn.cancel').click()
    await opp.getByText('Соперник отклонил ничью').waitFor({ timeout: 4000 })
    await atlas.shot(opp, G, 'бой-уведомление-отказ-от-ничьей', { settle: 100 })
  })

  await atlas.attempt('выход назад', async () => {
    await a.goBack()
    await a.locator('.confirm-overlay').waitFor({ timeout: 4000 })
    await atlas.shot(a, G, 'окно-выйти-из-матча')
    await a.locator('.confirm-btn.cancel').click()
    await a.locator('[data-testid=board]').waitFor({ timeout: 4000 })
  })

  await atlas.attempt('соперник вышел', async () => {
    const url = b.url()
    await b.goto('about:blank')
    await a.locator('.opponent-left-banner').waitFor({ timeout: 5000 })
    await atlas.shot(a, G, 'бой-соперник-вышел')
    await b.goto(url)
    await b.locator('[data-testid=board]').waitFor({ timeout: 10000 })
    await a.locator('.opponent-left-banner').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
    await sleep(400)
  })
}

async function surrender(loser) {
  await loser.locator('.surrender-btn').click({ timeout: 3000 })
  await loser.locator('.confirm-btn.danger').click({ timeout: 3000 })
}

async function drawByAgreement(a, b) {
  const [me, opp] = await waitForTurn(a, b)
  await opp.locator('.draw-btn').click({ timeout: 3000 })
  await me.locator('.confirm-overlay').waitFor({ timeout: 4000 })
  await me.locator('.confirm-btn:not(.cancel)').click()
}

async function continueRound(a, b) {
  for (const p of [a, b]) {
    await p.locator('.restart-btn').first().waitFor({ timeout: 8000 })
    await p.locator('.restart-btn').first().click()
  }
  await a.locator('.dr-catalog').waitFor({ timeout: 10000 })
  await b.locator('.dr-catalog').waitFor({ timeout: 10000 })
}

// ── A full match: lose, draw, lose — every outcome screen comes up ───
async function matchScreens(browser, base, atlas, rec, rng) {
  const a = await newPage(browser, atlas.profile, rec, 'A')
  const b = await newPage(browser, atlas.profile, rec, 'B')
  try {
    await lobbyScreens(browser, base, atlas, rec, a, b)
    await draftScreens(atlas, a, b)
    await placementScreens(atlas, a, b, rng)
    await battleScreens(atlas, a, b)

    const G = 'Итоги'
    await surrender(a)
    await a.locator('.result-inline').waitFor({ timeout: 8000 })
    await b.locator('.result-inline').waitFor({ timeout: 8000 })
    await atlas.shot(a, G, 'итоги-раунда-поражение', { settle: 900 })
    await atlas.shot(b, G, 'итоги-раунда-победа', { settle: 0 })
    await continueRound(a, b)

    await draftScreens(atlas, a, b, { shots: false })
    await placementScreens(atlas, a, b, rng, { shots: false })
    await drawByAgreement(a, b)
    await a.locator('.result-inline').waitFor({ timeout: 8000 })
    await atlas.shot(a, G, 'итоги-раунда-ничья', { settle: 900 })
    await continueRound(a, b)

    await draftScreens(atlas, a, b, { shots: false })
    await placementScreens(atlas, a, b, rng, { shots: false })
    await surrender(a)
    await a.locator('.result-overlay').waitFor({ timeout: 8000 })
    await b.locator('.result-overlay').waitFor({ timeout: 8000 })
    await atlas.shot(a, G, 'матч-окончен-поражение', { settle: 900 })
    await atlas.shot(b, G, 'матч-окончен-победа', { settle: 0 })
  } finally {
    await a.context().close().catch(() => {})
    await b.context().close().catch(() => {})
  }
}

// ── index.html: all three resolutions side by side, by screen ────────
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
