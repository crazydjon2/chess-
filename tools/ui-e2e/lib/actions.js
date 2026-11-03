// What a player does, expressed as UI clicks. Every helper drives the real
// interface (no shortcuts into game state) so a broken button, a modal that
// never opens or an element hidden off-screen fails exactly like it would
// for a person. Desktop and phone layouts differ (side rails vs slide-out
// drawers) — the helpers handle both.
import { sleep } from './harness.js'

const T = { short: 3000, normal: 8000, long: 20000 }

export async function visible(page, sel) {
  return page.locator(sel).first().isVisible().catch(() => false)
}

export async function isPhoneLayout(page) {
  return visible(page, '.sd-trigger')
}

// ── Lobby ──────────────────────────────────────────────────────────────
export async function openOnline(page, base, nickname) {
  await page.goto(base + '/')
  await page.locator('.mm-hero').click({ timeout: T.normal })
  await page.waitForURL(/\/online$/, { timeout: T.normal })
  const input = page.locator('.po-input:not(.po-code-input)').first()
  await input.fill(nickname)
}

export async function createRoom(page, { visibility = 'public', color = 'random' } = {}) {
  await page.locator('.po-create-btn').click({ timeout: T.normal })
  await page.locator(`.po-opt`).nth(visibility === 'public' ? 0 : 1).click()
  await page.locator(`.po-color-opt.${color}`).click()
  await page.locator('.po-modal-submit').click()
  await page.waitForURL(/\/room\/[A-Z0-9]+$/, { timeout: T.normal })
  return page.url().split('/room/')[1]
}

export async function joinFromList(page, code) {
  const row = page.locator('.po-room', { hasText: code })
  await row.first().waitFor({ timeout: T.long })
  await row.first().locator('button').first().click()
  await page.waitForURL(new RegExp(`/room/${code}$`), { timeout: T.normal })
}

export async function joinByCode(page, code) {
  await page.locator('.po-code-input').fill(code)
  await page.locator('.po-code-btn').click()
  await page.waitForURL(new RegExp(`/room/${code}$`), { timeout: T.normal })
}

export async function startMatch(page) {
  const btn = page.locator('.wr-start-btn')
  await btn.waitFor({ timeout: T.normal })
  await page.waitForFunction(() => !document.querySelector('.wr-start-btn')?.disabled, null, { timeout: T.normal })
  await btn.click()
}

// ── Draft ──────────────────────────────────────────────────────────────
export async function onDraft(page) { return visible(page, '.dr-catalog') }
export async function myDraftTurn(page) { return visible(page, '.dr-tray-mine.active') }

// One pick (or "done" when nothing is affordable). Returns what it did.
export async function draftStep(page, rng, { preferDone = 0.08 } = {}) {
  const tiles = page.locator('.dr-catalog .gc-card:not(.gc-disabled)')
  const n = await tiles.count()
  if (!n || rng() < preferDone) {
    const done = page.locator('.dr-tray-done-btn')
    if (await done.isEnabled().catch(() => false)) { await done.click(); return 'done' }
    return 'none'
  }
  const i = Math.floor(rng() * n)
  const name = await tiles.nth(i).locator('.gc-plate-name').innerText().catch(() => '?')
  await tiles.nth(i).scrollIntoViewIfNeeded().catch(() => {})
  await tiles.nth(i).click()
  return name
}

// ── Placement ──────────────────────────────────────────────────────────
export async function onPlacement(page) { return visible(page, '.pl-board') }

// Place every remaining piece by clicking a piece card then a free own cell.
export async function placeAll(page, rng, { max = 30 } = {}) {
  for (let i = 0; i < max; i++) {
    const phone = await isPhoneLayout(page)
    let card
    if (phone) {
      const trig = page.locator('.sd-trigger:not(.sd-trigger-cancel)').first()
      if (!(await trig.isEnabled().catch(() => false))) break
      await trig.click()
      card = page.locator('.sd-panel .gc-card:not(.gc-disabled)').first()
      // the panel slides in — give it time before deciding it's empty
      const shown = await card.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)
      if (!shown) { await page.locator('.sd-panel-close').click().catch(() => {}); break }
    } else {
      card = page.locator('.pl-piece-rail .gc-card:not(.gc-disabled)').first()
      if (!(await card.isVisible().catch(() => false))) break
    }
    await card.click()
    const cells = page.locator('.pl-cell.mine:not(.occupied)')
    const n = await cells.count()
    if (!n) break
    await cells.nth(Math.floor(rng() * n)).click()
    await sleep(30)
  }
}

export async function remainingToPlace(page) {
  const t = await page.locator('.pl-tray-count.mine').innerText().catch(() => '')
  return Number((t.match(/\d+/) ?? ['0'])[0])
}

// ── Battle ─────────────────────────────────────────────────────────────
export async function onBattle(page) { return visible(page, '[data-testid=board]') && !(await visible(page, '.pl-board')) }
export async function myBattleTurn(page) { return visible(page, '.player-panel.mine.active') }

async function boardAttr(page, name) {
  return page.locator('[data-testid=board]').first().getAttribute(name).catch(() => '')
}

async function clickSquare(page, sq) {
  await page.locator(`[data-testid=board] rect[data-square="${sq}"]`).first().click({ force: true, timeout: T.short })
}

// Picks one of my pieces that the UI offers moves for, then one of those
// highlighted squares (captures preferred). Returns "e2e4" or null.
export async function makeMove(page, rng) {
  // a card left armed would turn every square click into a card target
  if ((await boardAttr(page, 'data-mode')) === 'card_targeting') {
    if (await isPhoneLayout(page)) await page.locator('.sd-trigger-cancel').click().catch(() => {})
    else await page.keyboard.press('Escape').catch(() => {})
    await sleep(100)
    if ((await boardAttr(page, 'data-mode')) === 'card_targeting') {
      await page.locator('.card-hand .gc-card.gc-selected').first().click().catch(() => {})
    }
  }
  const squares = await page.locator('[data-testid=board] rect[data-piece]').evaluateAll(els => els.map(e => [e.getAttribute('data-square'), e.getAttribute('data-piece')]))
  // Online: my color is on my own panel. Sandbox (hot-seat) has no "mine"
  // panel — whoever is to move is "me", so any piece may be tried.
  const myColor = await page.evaluate(() => {
    const tag = document.querySelector('.player-panel.mine .player-color-tag')
    return tag ? (tag.className.includes('p-white') ? 'white' : 'black') : null
  })
  const mine = squares.filter(([, p]) => !myColor || p.startsWith(myColor + '-')).sort(() => rng() - 0.5)
  const occupied = new Map(squares)
  for (const [sq] of mine) {
    await clickSquare(page, sq)
    const targets = (await boardAttr(page, 'data-targets')).split(' ').filter(Boolean)
    if (!targets.length) continue
    const moverColor = myColor ?? occupied.get(sq).split('-')[0]
    const caps = targets.filter(t => occupied.has(t) && !occupied.get(t).startsWith(moverColor))
    const to = caps.length && rng() < 0.8 ? caps[Math.floor(rng() * caps.length)] : targets[Math.floor(rng() * targets.length)]
    await clickSquare(page, to)
    // promotion picker may pop up
    if (await page.locator('.promo-btn').first().isVisible().catch(() => false)) await page.locator('.promo-btn').first().click()
    return sq + to
  }
  return null
}

// Plays a random card from the hand at a random offered target.
export async function playCard(page, rng) {
  const phone = await isPhoneLayout(page)
  let cards
  if (phone) {
    const trig = page.locator('.sd-trigger:not(.sd-trigger-cancel)').first()
    if (!(await trig.isEnabled().catch(() => false))) return null
    await trig.click()
    cards = page.locator('.sd-panel .gc-card:not(.gc-disabled)')
    await cards.first().waitFor({ state: 'visible', timeout: 2500 }).catch(() => {})
  } else cards = page.locator('.card-hand .gc-card:not(.gc-disabled)')
  const n = await cards.count()
  if (!n) { if (phone) await page.locator('.sd-panel-close').click().catch(() => {}); return null }
  const i = Math.floor(rng() * n)
  const name = await cards.nth(i).locator('.gc-plate-name').innerText().catch(() => '?')
  await cards.nth(i).click()
  // phone: the drawer slides away — its backdrop would swallow the target click
  if (phone) await page.locator('.sd-backdrop').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {})
  await sleep(80)
  const targets = (await boardAttr(page, 'data-card-targets')).split(' ').filter(Boolean)
  if (!targets.length) {
    // no square targets: cancel targeting so the board is usable again
    if (phone) await page.locator('.sd-trigger-cancel').click().catch(() => {})
    else await cards.nth(i).click().catch(() => {})
    return name + ' (без цели)'
  }
  const t = targets[Math.floor(rng() * targets.length)]
  await clickSquare(page, t)
  return `${name} → ${t}`
}
