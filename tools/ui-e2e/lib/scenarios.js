// The click-through scenarios. Each one is a story a real player goes
// through; every step is recorded (pass/fail + screenshot) and layout is
// checked on every screen it reaches.
import { newPage, checkLayout, sleep } from './harness.js'
import * as A from './actions.js'

const BATTLE_MUST_SEE = ['[data-testid=board]', '[data-testid=surrender-btn]', '[data-testid=draw-btn]', '.pc-card', '.mx-right .cd-panel', '.mx-tray']
// The portrait card tray is a horizontal scroll strip (tiles past the edge
// are expected), so the tray itself is what must be on screen.
const RECRUIT_MUST_SEE = ['[data-testid=board]', '[data-testid=recruit-done]', '.pc-card', '.mx-right .cd-row', '.mx-tray']
const isPhone = p => p.profile.startsWith('mobile')

// ── 1. Menu tour + sandbox ────────────────────────────────────────────
export async function menuTour(browser, base, profile, rec, rng) {
  const S = `menu/${profile}`
  const page = await newPage(browser, profile, rec, 'solo')
  await rec.step(S, 'главное меню открывается', page, async () => {
    await page.goto(base + '/')
    await page.locator('[data-testid=menu-online]').waitFor({ timeout: 10000 })
    await checkLayout(page, rec, 'меню', { noScroll: isPhone(page), mustSee: ['[data-testid=menu-online]', '[data-testid=menu-bot]', '[data-testid=menu-news]', '.mm-minor'] })
  }, { critical: true, shot: true })

  await rec.step(S, '«Как играть»: все вкладки и карты', page, async () => {
    await page.locator('[data-testid=menu-howto]').click()
    const tabs = page.locator('.htp-tabs button')
    const n = await tabs.count()
    if (n < 3) throw new Error('вкладок меньше трёх')
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await checkLayout(page, rec, `как играть · вкладка ${i + 1}`, { mustSee: ['.htp-head .ui-btn'] }) }
    await tabs.nth(1).click()
    await page.locator('.ui-overlay:not(.leaving) .htp-card').nth(2).click()
    await page.locator('.htp-card-desc').waitFor({ timeout: 3000 })
    await page.locator('.htp-head .ui-btn').click()
    if (await A.visible(page, '.ui-overlay:not(.leaving) .htp-card-modal')) throw new Error('окно не закрылось')
  }, { shot: true })

  await rec.step(S, '«Что нового» открывается и закрывается', page, async () => {
    await page.locator('[data-testid=menu-news]').click()
    await page.locator('.pn-head .ui-btn').click({ timeout: 5000 })
  })

  await rec.step(S, 'настройки: переключатели, язык, закрытие', page, async () => {
    await page.locator('.mm-top [data-testid=settings-btn]').click()
    const toggles = page.locator('.ui-overlay:not(.leaving) .set-toggle')
    for (let i = 0; i < await toggles.count(); i++) { await toggles.nth(i).click(); await toggles.nth(i).click() }
    await page.locator('.ui-overlay:not(.leaving) .set-lang-btn').click()
    await page.locator('.ui-overlay:not(.leaving) .set-lang-opt').nth(1).click() // the language right after the current one
    await page.locator('.ui-overlay:not(.leaving) .set-lang-btn').click()
    await page.locator('.ui-overlay:not(.leaving) .set-lang-opt[lang], .set-lang-opt').filter({ hasText: 'Русский' }).first().click()
    await checkLayout(page, rec, 'настройки', { mustSee: ['.set-card .ui-modal-close'] })
    await page.locator('.set-card .ui-modal-close').click()
    if (!(await page.getByText('Найти соперника').first().isVisible())) throw new Error('язык не вернулся на русский')
  })

  await rec.step(S, 'песочница: ходы и все карты', page, async () => {
    // no menu button: the sandbox is a test page reached by URL
    await page.goto(new URL('/sandbox', page.url()).href)
    await page.waitForURL(/\/sandbox$/)
    await page.locator('[data-testid=board]').waitFor({ timeout: 10000 })
    await sleep(400)
    await checkLayout(page, rec, 'песочница', { noScroll: isPhone(page), mustSee: ['[data-testid=board]', '[data-testid=sandbox-reset]', '.mx-header-left .ui-btn'] })
    let moves = 0, cardsPlayed = 0
    for (let i = 0; i < 24; i++) {
      if (rng() < 0.4) { const c = await A.playCard(page, rng); if (c) cardsPlayed++ }
      const m = await A.makeMove(page, rng)
      if (m) moves++
      if (await A.visible(page, '.ui-overlay:not(.leaving) .rs-card')) break
    }
    if (moves < 3) throw new Error(`удалось сделать только ${moves} ходов`)
    rec.notes ??= []; rec.notes.push(`${S}: песочница — ${moves} ходов, ${cardsPlayed} карт`)
  }, { shot: true })

  await rec.step(S, 'конец партии в песочнице: «Сбросить» и снова играть', page, async () => {
    if (!(await A.visible(page, '.ui-overlay:not(.leaving) .rs-card'))) return
    await page.locator('[data-testid=result-primary]').click()
    for (let i = 0; i < 3; i++) await A.makeMove(page, rng)
  })

  await rec.step(S, 'журнал боя: открыть, перемотать, вернуться', page, async () => {
    const j = await A.journal(page)
    const entries = j.locator('.jr-row.btn:not(.group)')
    if (await entries.count() < 2) throw new Error('в журнале меньше двух записей')
    await entries.nth(0).click() // the first move — a real step back in history
    const back = page.locator('.bt-history-back, .jr-back').first()
    await back.waitFor({ timeout: 3000 }).catch(() => { throw new Error('после выбора старой записи нет кнопки возврата') })
    await back.click()
    if (await A.visible(page, '.bt-history-back')) throw new Error('кнопка возврата не исчезла')
  })

  await rec.step(S, 'выход из песочницы в меню', page, async () => {
    await page.locator('.mx-header-left .ui-btn').first().click()
    await page.waitForURL(u => !u.pathname.startsWith('/sandbox'), { timeout: 5000 })
    await page.locator('[data-testid=menu-online]').waitFor({ timeout: 5000 })
  })
  await page.context().close()
}

// ── 2. Full online match between two browsers ─────────────────────────
export async function onlineMatch(browser, base, profile, rec, rng, opts = {}) {
  const S = `online/${profile}`
  const a = await newPage(browser, profile, rec, 'A')
  const b = await newPage(browser, opts.otherProfile ?? profile, rec, 'B')
  let code

  await rec.step(S, 'A ищет соперника', [a, b], async () => {
    code = await A.quickMatch(a, base, 'Алиса')
    await checkLayout(a, rec, 'поиск соперника', { mustSee: ['[data-testid=quick-search]', '[data-testid=share-link]', '[data-testid=wait-back]'] })
  }, { critical: true, shot: true })

  await rec.step(S, 'B ищет соперника и попадает к A', [a, b], async () => {
    const codeB = await A.quickMatch(b, base, 'Борис')
    if (codeB !== code) throw new Error(`B попал в другую комнату: ${codeB} вместо ${code}`)
  }, { critical: true })

  await rec.step(S, 'матч стартует сам после отсчёта', [a, b], async () => {
    await a.locator('.mx-screen.recruit').waitFor({ timeout: 10000 })
    await b.locator('.mx-screen.recruit').waitFor({ timeout: 10000 })
  }, { critical: true, shot: true })

  for (let round = 1; round <= 3; round++) {
    const R = `${S}/раунд ${round}`
    const finished = await playRound(a, b, R, rec, rng, round, opts)
    if (finished !== 'continue') break
  }

  await rec.step(S, 'конец матча → реванш виден сопернику, A уходит в меню', [a, b], async () => {
    await a.locator('.ui-overlay:not(.leaving) .rs-card').waitFor({ timeout: 15000 })
    await checkLayout(a, rec, 'конец матча', { mustSee: ['.ui-overlay:not(.leaving) .rs-card .ui-btn'] })
    await b.locator('[data-testid=result-primary]').click()
    await a.getByText('предлагает реванш').waitFor({ timeout: 5000 })
    await a.locator('.ui-overlay:not(.leaving) .rs-card .ui-btn:not(.primary)').click()
    // A search started from the main menu returns there.
    await a.waitForURL(u => new URL(u).pathname === '/', { timeout: 8000 })
  }, { shot: true })
  await a.context().close(); await b.context().close()
}

async function playRound(a, b, R, rec, rng, round, opts) {
  if (round > 1) {
    // The match may already be decided (2 wins) — then "В меню"/"Реванш".
    const first = a.locator('[data-testid=result-primary]').first()
    await first.waitFor({ timeout: 15000 }).catch(() => {})
    if (await A.visible(a, '.ui-overlay:not(.leaving) .rs-card') && !/раунд/i.test(await first.innerText().catch(() => ''))) return 'match_over'
    const ok = await rec.step(R, 'итоги раунда: оба нажимают «Следующий раунд»', [a, b], async () => {
      for (const p of [a, b]) {
        const btn = p.locator('[data-testid=result-primary]')
        await btn.first().waitFor({ timeout: 15000 })
        await checkLayout(p, rec, 'итоги раунда', { mustSee: ['[data-testid=result-primary]'] })
        await btn.first().click()
      }
      await a.locator('.mx-screen.recruit').waitFor({ timeout: 10000 })
    }, { shot: true })
    if (!ok) return 'stuck'
  }

  const timerRound = opts.letRecruitTimerRun && round === 1
  await rec.step(R, 'набор: фигуры сразу на доску, соперник видит их вживую', [a, b], async () => {
    await checkLayout(a, rec, 'набор', { noScroll: isPhone(a), mustSee: RECRUIT_MUST_SEE })
    await checkLayout(b, rec, 'набор', { noScroll: isPhone(b), mustSee: RECRUIT_MUST_SEE })
    const t0 = Date.now()
    const picks = { A: 0, B: 0 }
    let seenLive = false, placed = false
    while (Date.now() - t0 < 120000) {
      if (await A.onBattle(a) && await A.onBattle(b)) break
      for (const [p, k, other] of [[a, 'A', b], [b, 'B', a]]) {
        if (timerRound && k === 'B') continue // B idles: its recruit clock must run out
        if (await A.onRecruit(p) && await A.myRecruitTurn(p)) {
          const did = await A.recruitStep(p, rng, { preferDone: picks[k] < 3 ? 0 : picks[k] >= 6 ? 0.5 : 0.04 })
          picks[k]++
          const sq = / → ([a-h]\d)$/.exec(did)?.[1]
          if (sq) placed = true
          if (sq && !seenLive) {
            await other.locator(`[data-testid=board] .bd-piece[data-square="${sq}"]`).waitFor({ timeout: 4000 })
            seenLive = true
          }
          await sleep(120)
        }
      }
      await sleep(80)
    }
    if (!(await A.onBattle(a))) throw new Error('набор не закончился за 120 с')
    if (placed && !seenLive) throw new Error('соперник так и не увидел ни одной купленной фигуры')
    rec.notes ??= []; rec.notes.push(`${R}: набор — A ${picks.A}, B ${picks.B} действий${timerRound ? ' (у B кончилось время)' : ''}`)
  }, { critical: true, shot: true })

  await rec.step(R, 'бой: экран боя у обоих', [a, b], async () => {
    await b.locator('[data-testid=surrender-btn]').waitFor({ timeout: 10000 })
    await sleep(600)
    await checkLayout(a, rec, 'бой', { noScroll: isPhone(a), mustSee: BATTLE_MUST_SEE })
    await checkLayout(b, rec, 'бой', { noScroll: isPhone(b), mustSee: BATTLE_MUST_SEE })
  }, { critical: true, shot: true })

  let plies = 0, cards = 0
  const ended = () => A.visible(a, '.ui-overlay:not(.leaving) .rs-card')
  await rec.step(R, 'бой: ходы и карты', [a, b], async () => {
    const t0 = Date.now()
    while (plies < (opts.plies ?? 16) && Date.now() - t0 < 120000) {
      if (await ended()) break
      const p = (await A.myBattleTurn(a)) ? a : (await A.myBattleTurn(b)) ? b : null
      if (!p) { await sleep(150); continue }
      if (rng() < 0.35) { if (await A.playCard(p, rng)) cards++ }
      if (await ended()) break
      let m = await A.makeMove(p, rng)
      if (!m && !(await ended())) {
        for (let k = 0; k < 4 && !m; k++) { if (await A.playCard(p, rng)) cards++; m = await A.makeMove(p, rng) }
        rec.notes ??= []; rec.notes.push(`${R}: ${p.label} остался без ходов${m ? ', выход нашёлся через карту' : ''}`)
        if (!m && !(await ended())) throw new Error(`${p.label}: нет ни одного хода, который UI предлагает (даже через карты)`)
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
      await offerer.locator('[data-testid=draw-btn]').click()
      await offerer.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn.primary').click()
      await other.locator('.mx-banner').waitFor({ timeout: 5000 })
      await checkLayout(other, rec, 'предложение ничьей', { mustSee: ['.mx-banner .ui-btn'] })
      await other.locator('.mx-banner .ui-btn:not(.primary)').click()
      await offerer.getByText('Соперник отклонил ничью').waitFor({ timeout: 5000 })
    }, { shot: true })

    await rec.step(R, 'перезагрузка посреди боя возвращает в матч', [a, b], async () => {
      const url = a.url()
      await a.reload()
      await a.locator('[data-testid=board]').waitFor({ timeout: 10000 })
      if (a.url() !== url) throw new Error('после перезагрузки другой адрес: ' + a.url())
      await sleep(500)
      if (await A.visible(b, '.mx-opp-left')) throw new Error('у B осталась плашка «Соперник покинул игру»')
    }, { shot: true })

    await rec.step(R, '«Назад» в браузере спрашивает подтверждение', [a, b], async () => {
      await a.goBack()
      await a.locator('.ui-overlay:not(.leaving) .ui-confirm').waitFor({ timeout: 5000 })
      await a.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn:not(.danger)').first().click()
      await a.locator('[data-testid=board]').waitFor({ timeout: 5000 })
    })

    await rec.step(R, 'кнопка выхода в шапке спрашивает подтверждение', [a, b], async () => {
      await a.locator('[data-testid=exit-btn]').click()
      await a.locator('.ui-overlay:not(.leaving) .ui-confirm').waitFor({ timeout: 5000 })
      await a.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn:not(.danger)').first().click()
      await a.locator('[data-testid=board]').waitFor({ timeout: 5000 })
    })

    await rec.step(R, 'сдача (на чужом ходу)', [a, b], async () => {
      const notMover = (await A.myBattleTurn(a)) ? b : a
      await notMover.locator('[data-testid=surrender-btn]').click()
      await notMover.locator('.ui-overlay:not(.leaving) .ui-confirm .ui-btn.danger').click()
      await a.locator('.ui-overlay:not(.leaving) .rs-card').waitFor({ timeout: 8000 })
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
  await rec.step(S, 'A создаёт комнату по коду', [a, b], async () => {
    await A.openOnline(a, base, 'Хост')
    code = await A.createRoom(a, { visibility: 'private', color: 'white' })
  }, { critical: true })
  await rec.step(S, 'комнаты по коду нет в списке', [a, b], async () => {
    await A.openOnline(b, base, 'Гость')
    await sleep(800)
    if (await b.locator(`.po-row[data-room="${code}"]`).count()) throw new Error('комната по коду видна в списке')
  })
  await rec.step(S, 'B вводит код и попадает в комнату', [a, b], async () => {
    await A.joinByCode(b, code)
    await b.locator('[data-testid=wait-back]').waitFor({ timeout: 10000 })
    await a.locator('[data-testid=start-game]').waitFor({ timeout: 8000 })
    await b.locator('[data-testid=wait-back]').click()
    await b.waitForURL(/\/online$/, { timeout: 8000 })
  }, { shot: true })
  await rec.step(S, 'B открывает ссылку /room/КОД и попадает в комнату', [a, b], async () => {
    await b.goto(`${base}/room/${code}`)
    await b.locator('[data-testid=wait-back]').waitFor({ timeout: 10000 })
    await a.locator('[data-testid=start-game]').waitFor({ timeout: 8000 })
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
    await a.locator('[data-testid=wait-back]').click()
    await a.waitForURL(/\/online$/, { timeout: 8000 })
  })
  await a.context().close(); await b.context().close()
}

// ── 4. Against the AI: menu → recruit → battle ────────────────────────
export async function botMatch(browser, base, profile, rec, rng) {
  const S = `bot/${profile}`
  const page = await newPage(browser, profile, rec, 'bot')
  await rec.step(S, '«Против ИИ» из меню открывает выбор и запускает матч', page, async () => {
    await page.goto(base + '/')
    await page.locator('[data-testid=menu-bot]').click()
    await page.locator('[data-testid=bot-start]').click()
    await page.locator('.mx-screen.recruit').waitFor({ timeout: 10000 })
  }, { critical: true, shot: true })
  await rec.step(S, 'набор против ИИ до боя', page, async () => {
    const t0 = Date.now()
    let picks = 0
    while (Date.now() - t0 < 90000 && !(await A.onBattle(page))) {
      if (await A.myRecruitTurn(page)) { await A.recruitStep(page, rng, { preferDone: picks >= 5 ? 0.6 : 0.05 }); picks++ }
      await sleep(150)
    }
    if (!(await A.onBattle(page))) throw new Error('бой не начался')
  }, { shot: true })
  await rec.step(S, 'несколько ходов против ИИ', page, async () => {
    let plies = 0
    const t0 = Date.now()
    while (plies < 6 && Date.now() - t0 < 60000) {
      if (await A.visible(page, '.ui-overlay:not(.leaving) .rs-card')) break
      if (await A.myBattleTurn(page)) { if (await A.makeMove(page, rng)) plies++ }
      await sleep(200)
    }
    if (plies < 2 && !(await A.visible(page, '.ui-overlay:not(.leaving) .rs-card'))) throw new Error(`сделано только ${plies} ходов`)
  }, { shot: true })
  await page.context().close()
}

// ── 5. Monkey: random clicks on anything clickable ────────────────────
export async function monkey(browser, base, profile, rec, rng, { steps = 150 } = {}) {
  const S = `monkey/${profile}`
  const page = await newPage(browser, profile, rec, 'monkey')
  await rec.step(S, `случайные клики (${steps})`, page, async () => {
    await page.goto(base + '/')
    let clicks = 0
    for (let i = 0; i < steps; i++) {
      if (!page.url().startsWith(base)) await page.goto(base + '/')
      const targets = await page.locator('button:visible, [role=button]:visible, .bd-cell, .bd-piece').all()
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
