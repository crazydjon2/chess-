// What a player does, expressed as UI clicks. Every helper drives the real
// interface (no shortcuts into game state) so a broken button, a modal that
// never opens or an element hidden off-screen fails exactly like it would
// for a person. Desktop (side columns) and portrait (cards tray under the
// board) layouts differ — the helpers handle both.
import { sleep } from './harness.js'

const T = { short: 3000, normal: 8000, long: 20000 }

export async function visible(page, sel) {
  return page.locator(sel).first().isVisible().catch(() => false)
}

// Portrait layout: cards live in the tray under the board.
export async function isTrayLayout(page) {
  return visible(page, '.mx-tray')
}

// ── Lobby ──────────────────────────────────────────────────────────────
export async function openOnline(page, base, nickname) {
  await page.goto(base + '/')
  await page.locator('[data-testid=menu-online]').click({ timeout: T.normal })
  await page.waitForURL(/\/online$/, { timeout: T.normal })
  await page.locator('[data-testid=nick-btn]').click()
  await page.locator('[data-testid=nick-input]').fill(nickname)
  await page.locator('[data-testid=nick-input]').press('Enter')
  await page.locator('[data-testid=nick-input]').waitFor({ state: 'detached', timeout: T.short })
}

const COLOR_INDEX = { white: 0, black: 1, random: 2 }
export async function createRoom(page, { visibility = 'public', color = 'random' } = {}) {
  await page.locator('[data-testid=create-lobby]').click({ timeout: T.normal })
  const segs = page.locator('.po-modal .ui-seg')
  await segs.nth(0).locator('button').nth(COLOR_INDEX[color]).click()
  await segs.nth(1).locator('button').nth(visibility === 'public' ? 0 : 1).click()
  await page.locator('[data-testid=create-submit]').click()
  await page.waitForURL(/\/room\/[A-Z0-9]+$/, { timeout: T.normal })
  return page.url().split('/room/')[1]
}

export async function joinFromList(page, code) {
  const row = page.locator(`.po-row[data-room="${code}"]`)
  await row.first().waitFor({ timeout: T.long })
  await row.first().click()
  await page.waitForURL(new RegExp(`/room/${code}$`), { timeout: T.normal })
}

// Typing the 5th character joins on its own.
export async function joinByCode(page, code) {
  await page.locator('[data-testid=code-input]').fill(code)
  await page.waitForURL(new RegExp(`/room/${code}$`), { timeout: T.normal })
}

export async function startMatch(page) {
  const btn = page.locator('[data-testid=start-game]')
  await btn.waitFor({ timeout: T.normal })
  await btn.click()
}

// ── Board helpers ──────────────────────────────────────────────────────
async function boardAttr(page, name) {
  return page.locator('[data-testid=board]').first().getAttribute(name).catch(() => '')
}

// A square is clicked on the square itself — pieces never take the pointer.
export async function clickSquare(page, sq) {
  await page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).first().click({ force: true, timeout: T.short })
}

export async function myColor(page) {
  return page.evaluate(() => {
    const av = document.querySelector('.mx-me .pc-head .ui-avatar')
    return av ? (av.classList.contains('white') ? 'white' : 'black') : null
  })
}

// ── Recruit (buying straight onto the board) ───────────────────────────
export async function onRecruit(page) { return visible(page, '.mx-screen.recruit') }
export async function myRecruitTurn(page) {
  return (await page.locator('[data-testid=board]').first().getAttribute('data-my-turn').catch(() => '')) === '1'
}

// Recruit turn: true while it's my move (the "done" button stays disabled
// until the king is down, so the board says it instead).
export async function myRecruitTurnBoard(page) {
  return (await boardAttr(page, 'data-my-turn')) === '1'
}

// One recruit action on my turn: the king first (free, through the same
// picker), then a piece onto a random free square, a card, or "done".
export async function recruitStep(page, rng, { preferDone = 0.08, cardChance = 0.25 } = {}) {
  const free = (await boardAttr(page, 'data-targets')).split(' ').filter(Boolean)
  if ((await boardAttr(page, 'data-mode')) === 'king') {
    if (!(await page.locator('[data-testid=recruit-done]').isDisabled())) throw new Error('«Готово» доступно до того, как поставлен король')
    const sq = free[Math.floor(rng() * free.length)]
    await page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).click({ force: true })
    await page.locator('.pk-pop').waitFor({ timeout: T.short })
    if (await page.locator('.pk-opt').count() !== 1) throw new Error('первым ходом предлагают не только короля')
    await page.locator('[data-testid=recruit-confirm]').click()
    return `король → ${sq}`
  }
  const r = rng()
  if (r < preferDone) {
    await page.locator('[data-testid=recruit-done]').click()
    return 'done'
  }
  if (r < preferDone + cardChance) {
    const did = await buyCard(page, rng)
    if (did) return did
  }
  if (free.length) {
    const sq = free[Math.floor(rng() * free.length)]
    await page.locator(`[data-testid=board] .bd-cell[data-square="${sq}"]`).click({ force: true })
    const opts = page.locator('.pk-pop .pk-opt:not([disabled])')
    await page.locator('.pk-pop').waitFor({ timeout: T.short })
    const n = await opts.count()
    if (n) {
      const pick = opts.nth(Math.floor(rng() * n))
      const type = await pick.getAttribute('data-piece-type')
      await pick.click()
      await page.locator('[data-testid=recruit-confirm]').click()
      return `${type} → ${sq}`
    }
    await page.keyboard.press('Escape')
  }
  const did = await buyCard(page, rng)
  if (did) return did
  await page.locator('[data-testid=recruit-done]').click()
  return 'done'
}

async function buyCard(page, rng) {
  const tray = await isTrayLayout(page)
  const cards = page.locator(tray ? '.mx-tray .cd-tile:not(.off)' : '.mx-right .cd-row:not(.off)')
  const n = await cards.count()
  if (!n) return null
  const c = cards.nth(Math.floor(rng() * n))
  const id = await c.getAttribute('data-card')
  await c.scrollIntoViewIfNeeded().catch(() => {})
  await c.click()
  const buy = page.locator(tray ? '.cd-pop .cd-pop-main' : '[data-testid=buy-card]').first()
  await buy.waitFor({ timeout: T.short })
  await buy.click()
  return `карта ${id}`
}

// ── Battle ─────────────────────────────────────────────────────────────
export async function onBattle(page) { return visible(page, '[data-testid=surrender-btn]') }
export async function myBattleTurn(page) { return visible(page, '.mx-me .pc-card.active') }

async function cancelArmedCard(page) {
  if ((await boardAttr(page, 'data-mode')) !== 'card_targeting') return
  if (await visible(page, '.bt-armed .ui-btn')) await page.locator('.bt-armed .ui-btn').click().catch(() => {})
  else await page.locator('.mx-right .cd-row.sel').first().click().catch(() => {})
  await sleep(80)
}

// Picks one of my pieces that the UI offers moves for, then one of those
// highlighted squares (captures preferred). Returns "e2e4" or null.
export async function makeMove(page, rng) {
  await cancelArmedCard(page)
  const squares = await page.locator('[data-testid=board] .bd-piece[data-piece]:not(.ghost)').evaluateAll(els => els.map(e => [e.getAttribute('data-square'), e.getAttribute('data-piece')]))
  const color = await myColor(page)
  const mine = squares.filter(([, p]) => !color || p.startsWith(color + '-')).sort(() => rng() - 0.5)
  const occupied = new Map(squares)
  for (const [sq] of mine) {
    await clickSquare(page, sq)
    const targets = (await boardAttr(page, 'data-targets')).split(' ').filter(Boolean)
    if (!targets.length) continue
    const mover = occupied.get(sq).split('-')[0]
    const caps = targets.filter(t => occupied.has(t) && !occupied.get(t).startsWith(mover))
    const to = caps.length && rng() < 0.8 ? caps[Math.floor(rng() * caps.length)] : targets[Math.floor(rng() * targets.length)]
    // the target cell, not a piece standing on it — that's the same square
    await page.locator(`[data-testid=board] .bd-cell[data-square="${to}"]`).first().click({ force: true, timeout: T.short })
    if (await page.locator('[data-promo]').first().isVisible().catch(() => false)) await page.locator('[data-promo]').first().click()
    return sq + to
  }
  return null
}

// Plays a random card from the hand at a random offered target.
export async function playCard(page, rng) {
  const tray = await isTrayLayout(page)
  const cards = page.locator(tray ? '.mx-tray .cd-tile:not(.off)' : '.mx-right .cd-panel.grow .cd-row:not(.off)')
  const n = await cards.count()
  if (!n) return null
  const i = Math.floor(rng() * n)
  const id = await cards.nth(i).getAttribute('data-card')
  await cards.nth(i).click()
  if (tray) {
    const aim = page.locator('.cd-pop .cd-pop-main')
    await aim.waitFor({ timeout: T.short })
    await aim.click()
  }
  await sleep(80)
  const targets = (await boardAttr(page, 'data-card-targets')).split(' ').filter(Boolean)
  if (!targets.length) {
    await cancelArmedCard(page)
    return id + ' (без цели)'
  }
  const t = targets[Math.floor(rng() * targets.length)]
  await page.locator(`[data-testid=board] .bd-cell[data-square="${t}"]`).first().click({ force: true, timeout: T.short })
  return `${id} → ${t}`
}

// Opens the journal (portrait: the sheet behind the header button).
export async function journal(page) {
  if (await visible(page, '[data-testid=log-btn]')) {
    await page.locator('[data-testid=log-btn]').click()
    return page.locator('.ui-overlay:not(.leaving) .bt-log-sheet')
  }
  return page.locator('.mx-body > .jr')
}
