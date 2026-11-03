// The click-through scenarios. Each one is a story a real player goes
// through; every step is recorded (pass/fail + screenshot) and layout is
// checked on every screen it reaches.
import { newPage, checkLayout, sleep } from './harness.js'
import * as A from './actions.js'

const BATTLE_MUST_SEE = ['[data-testid=board]', '.surrender-btn', '.draw-btn', '.player-panel', '.card-hand .gc-card', '.sd-trigger']
const PLACEMENT_MUST_SEE = ['.pl-board', '.pl-submit-btn']

// ── 1. Menu tour + sandbox ────────────────────────────────────────────
export async function menuTour(browser, base, profile, rec, rng) {
  const S = `menu/${profile}`
  const page = await newPage(browser, profile, rec, 'solo')
  await rec.step(S, 'главное меню открывается', page, async () => {
    await page.goto(base + '/')
    await page.locator('.mm-hero').waitFor({ timeout: 10000 })
    await checkLayout(page, rec, 'меню', { mustSee: ['.mm-hero', '.mm-card'] })
  }, { critical: true, shot: true })

  await rec.step(S, '«Как играть»: все вкладки', page, async () => {
    await page.locator('.mm-card-howto').click()
    const tabs = page.locator('.htp-tab')
    const n = await tabs.count()
    if (n < 2) throw new Error('вкладок меньше двух')
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await checkLayout(page, rec, `как играть · вкладка ${i + 1}`, { mustSee: ['.htp-close'] }) }
    await page.locator('.htp-close').click()
    if (await A.visible(page, '.htp-overlay')) throw new Error('окно не закрылось')
  }, { shot: true })

  await rec.step(S, '«Что нового» открывается и закрывается', page, async () => {
    await page.locator('.mm-card-patchnotes').click()
    await page.locator('.pn-close').click({ timeout: 5000 })
  })

  await rec.step(S, 'настройки: переключатели и закрытие', page, async () => {
    await page.locator('.ml-settings-btn').click()
    const toggles = page.locator('.set-toggle-row')
    for (let i = 0; i < await toggles.count(); i++) { await toggles.nth(i).click(); await toggles.nth(i).click() }
    await checkLayout(page, rec, 'настройки', { mustSee: ['.set-close'] })
    await page.locator('.set-close').click()
  })

  await rec.step(S, 'песочница: ходы и все карты', page, async () => {
    await page.locator('.mm-card-sandbox').click()
    await page.waitForURL(/\/sandbox$/)
    await page.locator('[data-testid=board]').waitFor({ timeout: 10000 })
    await checkLayout(page, rec, 'песочница', { noScroll: page.profile.startsWith('mobile'), mustSee: ['[data-testid=board]', '.card-hand .gc-card', '.sd-trigger', '.bt-back'] })
    let moves = 0, cardsPlayed = 0
    for (let i = 0; i < 24; i++) {
      if (rng() < 0.4) { const c = await A.playCard(page, rng); if (c) cardsPlayed++ }
      const m = await A.makeMove(page, rng)
      if (m) moves++
      if (await A.visible(page, '.result-overlay, .result-inline')) break
    }
    if (moves < 3) throw new Error(`удалось сделать только ${moves} ходов`)
    rec.notes ??= []; rec.notes.push(`${S}: песочница — ${moves} ходов, ${cardsPlayed} карт`)
  }, { shot: true })

  await rec.step(S, 'конец партии в песочнице: «Сбросить» и снова играть', page, async () => {
    if (!(await A.visible(page, '.result-overlay'))) return
    if (await A.visible(page, '.bt-back')) {
      const backHidden = await page.locator('.bt-back').evaluate(el => {
        const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !el.contains(hit)
      })
      if (backHidden) rec.layout.push({ where: `solo/${page.profile} · конец партии в песочнице`, kind: 'covered', text: 'Окно результата закрывает кнопку «←» — из законченной песочницы не выйти без «Сбросить»' })
    }
    await page.locator('.restart-btn').first().click()
    for (let i = 0; i < 3; i++) await A.makeMove(page, rng)
  })

  await rec.step(S, 'журнал боя: открыть, перемотать, вернуться', page, async () => {
    await page.locator('.bt-log-btn').click()
    const entries = page.locator('.bl-entry')
    if (await entries.count() < 2) throw new Error('в журнале меньше двух записей')
    await entries.nth(0).click() // the opening position — a real step back in history
    if (!(await A.visible(page, '.bl-return'))) throw new Error('после выбора старой записи нет кнопки возврата к текущей позиции')
    await page.locator('.bl-return').click()
    await page.locator('.bl-close').click()
  })

  await rec.step(S, 'выход из песочницы в меню', page, async () => {
    await page.locator('.bt-back').click()
    await page.waitForURL(u => !u.pathname.startsWith('/sandbox'), { timeout: 5000 })
    await page.locator('.mm-hero').waitFor({ timeout: 5000 })
  })
  await page.context().close()
}

// ── 2. Full online match between two browsers ─────────────────────────
export async function onlineMatch(browser, base, profile, rec, rng, opts = {}) {
  const S = `online/${profile}`
  const a = await newPage(browser, profile, rec, 'A')
  const b = await newPage(browser, opts.otherProfile ?? profile, rec, 'B')
  let code

  await rec.step(S, 'A создаёт открытую комнату', [a, b], async () => {
    await A.openOnline(a, base, 'Алиса')
    await checkLayout(a, rec, 'онлайн-меню', { mustSee: ['.po-create-btn'] })
    code = await A.createRoom(a, { visibility: 'public', color: 'random' })
    await checkLayout(a, rec, 'комната ожидания', { mustSee: ['.wr-start-btn', '.wr-cancel-btn'] })
  }, { critical: true, shot: true })

  await rec.step(S, 'B видит комнату в списке и входит', [a, b], async () => {
    await A.openOnline(b, base, 'Борис')
    await A.joinFromList(b, code)
  }, { critical: true })

  await rec.step(S, 'A запускает матч', [a, b], async () => {
    await A.startMatch(a)
    await a.locator('.dr-catalog').waitFor({ timeout: 10000 })
    await b.locator('.dr-catalog').waitFor({ timeout: 10000 })
  }, { critical: true, shot: true })

  for (let round = 1; round <= 3; round++) {
    const R = `${S}/раунд ${round}`
    const finished = await playRound(a, b, R, rec, rng, round, opts)
    if (finished === 'match_over') break
  }

  await rec.step(S, 'конец матча → обратно в меню', [a, b], async () => {
    const btn = a.locator('.restart-btn')
    await btn.first().waitFor({ timeout: 15000 })
    await btn.first().click()
    await a.waitForURL(/\/online$/, { timeout: 8000 })
  }, { shot: true })
  await a.context().close(); await b.context().close()
}

async function playRound(a, b, R, rec, rng, round, opts) {
  // round summary (rounds 2+): both continue
  if (round > 1) {
    // The match may already be decided (2 wins) — then the result screen
    // offers "В меню" instead of the next round.
    const first = a.locator('.restart-btn').first()
    await first.waitFor({ timeout: 15000 }).catch(() => {})
    if (/меню/i.test(await first.innerText().catch(() => ''))) return 'match_over'
    const ok = await rec.step(R, 'итоги раунда: оба нажимают «Продолжить»', [a, b], async () => {
      for (const p of [a, b]) {
        const btn = p.locator('.restart-btn')
        await btn.first().waitFor({ timeout: 15000 })
        await checkLayout(p, rec, 'итоги раунда', { mustSee: ['.restart-btn'] })
        await btn.first().click()
      }
      await a.locator('.dr-catalog').waitFor({ timeout: 10000 })
    }, { shot: true })
    if (!ok) return 'stuck'
  }

  await rec.step(R, 'драфт: покупки кликами по каталогу', [a, b], async () => {
    await checkLayout(a, rec, 'драфт', { mustSee: ['.dr-tray-done-btn'] })
    await checkLayout(b, rec, 'драфт', { mustSee: ['.dr-tray-done-btn'] })
    const t0 = Date.now()
    const picks = { A: 0, B: 0 }
    while (Date.now() - t0 < 90000) {
      if (await A.onPlacement(a) && await A.onPlacement(b)) break
      for (const [p, k] of [[a, 'A'], [b, 'B']]) {
        if (await A.onDraft(p) && await A.myDraftTurn(p)) {
          const did = await A.draftStep(p, rng, { preferDone: picks[k] >= 6 ? 0.5 : 0.05 })
          if (did !== 'none') picks[k]++
          await sleep(120)
        }
      }
      await sleep(80)
    }
    if (!(await A.onPlacement(a))) throw new Error('драфт не закончился за 90 с')
    rec.notes ??= []; rec.notes.push(`${R}: драфт — A ${picks.A}, B ${picks.B} действий`)
  }, { critical: true, shot: true })

  await rec.step(R, 'расстановка: соперник видит фигуры вживую', [a, b], async () => {
    await checkLayout(a, rec, 'расстановка', { noScroll: a.profile.startsWith('mobile'), mustSee: PLACEMENT_MUST_SEE })
    await A.placeAll(a, rng)
    await sleep(400)
    const seen = await b.locator('.pl-cell.opp .pl-cell-icon').count()
    if (!seen) throw new Error('B не видит ни одной фигуры A на его половине')
  }, { shot: true })

  await rec.step(R, 'расстановка: оба готовы → бой', [a, b], async () => {
    if (await A.remainingToPlace(a)) await A.placeAll(a, rng)
    await a.locator('.pl-submit-btn').click()
    if (opts.letPlacementTimerRun && round === 1) {
      // B places nothing: the timer must auto-place and start the battle
      await b.locator('[data-testid=board]').waitFor({ timeout: 70000 })
    } else {
      await A.placeAll(b, rng)
      await b.locator('.pl-submit-btn').click()
    }
    await a.locator('[data-testid=board]').waitFor({ timeout: 70000 })
    await sleep(600)
    await checkLayout(a, rec, 'бой', { noScroll: a.profile.startsWith('mobile'), mustSee: BATTLE_MUST_SEE })
    await checkLayout(b, rec, 'бой', { noScroll: b.profile.startsWith('mobile'), mustSee: BATTLE_MUST_SEE })
  }, { critical: true, shot: true })

  let plies = 0, cards = 0, drawTested = false, reloadTested = false, backTested = false
  const ended = () => A.visible(a, '.result-inline, .result-overlay')
  await rec.step(R, 'бой: ходы и карты', [a, b], async () => {
    const t0 = Date.now()
    while (plies < (opts.plies ?? 16) && Date.now() - t0 < 120000) {
      if (await ended()) break
      const p = (await A.myBattleTurn(a)) ? a : (await A.myBattleTurn(b)) ? b : null
      if (!p) { await sleep(150); continue }
      if (rng() < 0.35) { if (await A.playCard(p, rng)) cards++ }
      let m = await A.makeMove(p, rng)
      if (!m) {
        // No piece can move — the game only allows this when a card can open
        // a way out (see hasRescueCard), so try the hand before giving up.
        for (let k = 0; k < 4 && !m; k++) { if (await A.playCard(p, rng)) cards++; m = await A.makeMove(p, rng) }
        rec.notes ??= []; rec.notes.push(`${R}: ${p.label} остался без ходов${m ? ', выход нашёлся через карту' : ' — ход не найден даже через карты'}`)
        if (!m) throw new Error(`${p.label}: нет ни одного хода, который UI предлагает (даже через карты)`)
      }
      plies++
      await sleep(250)
    }
    rec.notes ??= []; rec.notes.push(`${R}: бой — ${plies} полуходов, ${cards} карт`)
  }, { shot: true })

  if (!(await ended())) {
    await rec.step(R, 'ничья: предложение и отказ', [a, b], async () => {
      const offerer = (await A.myBattleTurn(a)) ? b : a
      const other = offerer === a ? b : a
      await offerer.locator('.draw-btn').click()
      await other.locator('.confirm-overlay').waitFor({ timeout: 5000 })
      await checkLayout(other, rec, 'окно ничьей', { mustSee: ['.confirm-btn'] })
      await other.locator('.confirm-btn.cancel').click()
      await offerer.getByText('Соперник отклонил ничью').waitFor({ timeout: 5000 })
      drawTested = true
    }, { shot: true })

    await rec.step(R, 'перезагрузка посреди боя возвращает в матч', [a, b], async () => {
      const url = a.url()
      await a.reload()
      await a.locator('[data-testid=board]').waitFor({ timeout: 10000 })
      if (a.url() !== url) throw new Error('после перезагрузки другой адрес: ' + a.url())
      await sleep(500)
      if (await A.visible(b, '.opponent-left-banner')) throw new Error('у B осталась плашка «Соперник покинул игру»')
      reloadTested = true
    }, { shot: true })

    await rec.step(R, '«Назад» в браузере спрашивает подтверждение', [a, b], async () => {
      await a.goBack()
      await a.locator('.confirm-overlay').waitFor({ timeout: 5000 })
      await a.locator('.confirm-btn.cancel').click()
      await a.locator('[data-testid=board]').waitFor({ timeout: 5000 })
      backTested = true
    })

    await rec.step(R, 'сдача (на чужом ходу)', [a, b], async () => {
      const notMover = (await A.myBattleTurn(a)) ? b : a
      await notMover.locator('.surrender-btn').click()
      await notMover.locator('.confirm-btn.danger').click()
    }, { shot: true })
  }
  return 'continue'
}

// ── 3. Invite link: open /room/CODE directly ──────────────────────────
export async function inviteLink(browser, base, profile, rec) {
  const S = `invite/${profile}`
  const a = await newPage(browser, profile, rec, 'A')
  const b = await newPage(browser, profile, rec, 'B')
  let code
  await rec.step(S, 'A создаёт приватную комнату', [a, b], async () => {
    await A.openOnline(a, base, 'Хост')
    code = await A.createRoom(a, { visibility: 'private', color: 'white' })
  }, { critical: true })
  await rec.step(S, 'приватной комнаты нет в списке', [a, b], async () => {
    await A.openOnline(b, base, 'Гость')
    await sleep(800)
    if (await b.locator('.po-room', { hasText: code }).count()) throw new Error('приватная комната видна в списке')
  })
  await rec.step(S, 'B открывает ссылку /room/КОД и попадает в комнату', [a, b], async () => {
    await b.goto(`${base}/room/${code}`)
    await b.locator('.wr-cancel-btn').waitFor({ timeout: 10000 })
    await a.waitForFunction(() => !document.querySelector('.wr-start-btn')?.disabled, null, { timeout: 8000 })
  }, { shot: true })
  await rec.step(S, 'несуществующая комната → список комнат с ошибкой', [a, b], async () => {
    await b.goto(`${base}/room/ZZZZZ`)
    await b.waitForURL(/\/online$/, { timeout: 10000 })
  })
  await rec.step(S, 'старая ссылка ?room= перенаправляется', [a, b], async () => {
    await b.goto(`${base}/?room=${code}`)
    await b.waitForURL(new RegExp(`/room/${code}$`), { timeout: 10000 })
  })
  await rec.step(S, 'хост отменяет комнату', [a, b], async () => {
    await a.locator('.wr-cancel-btn').click()
    await a.waitForURL(/\/online$/, { timeout: 8000 })
  })
  await a.context().close(); await b.context().close()
}

// ── 4. Monkey: random clicks on anything clickable ────────────────────
export async function monkey(browser, base, profile, rec, rng, { steps = 150 } = {}) {
  const S = `monkey/${profile}`
  const page = await newPage(browser, profile, rec, 'monkey')
  await rec.step(S, `случайные клики (${steps})`, page, async () => {
    await page.goto(base + '/')
    let clicks = 0
    for (let i = 0; i < steps; i++) {
      // never leave the site or drop into an online room with nobody there forever
      if (!page.url().startsWith(base)) await page.goto(base + '/')
      const targets = await page.locator('button:visible, [role=button]:visible, [data-testid=board] rect[data-square], .pl-cell:visible, .htp-tab:visible').all()
      if (!targets.length) { await page.goto(base + '/'); continue }
      const t = targets[Math.floor(rng() * targets.length)]
      await t.click({ timeout: 1500, force: true }).then(() => clicks++).catch(() => {})
      await sleep(60)
      if (rng() < 0.03) await page.goBack().catch(() => {})
    }
    await checkLayout(page, rec, 'после обезьяны')
    rec.notes ??= []; rec.notes.push(`${S}: ${clicks} кликов, конечный экран ${page.url()}`)
  }, { shot: true })
  await page.context().close()
}
