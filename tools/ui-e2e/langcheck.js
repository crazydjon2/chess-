#!/usr/bin/env node
// Every language × narrow phone + small laptop: walks the screens and reports
// text that is clipped and elements that stick out of the screen. Long
// translations (es/de/fr/pt…) are where layouts break first.
//
//   node tools/ui-e2e/langcheck.js              # all 13 languages
//   node tools/ui-e2e/langcheck.js --langs es,de --no-build
//
// Shots of every screen with a problem go to reports/langcheck/.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildClient, startServer, launchBrowser, sleep } from './lib/harness.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const val = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null }
const LANGS = (val('langs') ?? 'ru,en,uk,es,pt,fr,de,it,pl,tr,zh,ja,ko').split(',')
const ALL_SIZES = { phone: { width: 360, height: 640, mobile: true }, laptop: { width: 1280, height: 720, mobile: false } }
const SIZES = val('sizes') ? Object.fromEntries(val('sizes').split(',').map(k => [k, ALL_SIZES[k]])) : ALL_SIZES
const OUT = path.join(HERE, 'reports', 'langcheck')

// Runs in the page: clipped text + things outside the viewport.
export function scan() {
  const vw = innerWidth
  const out = []
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 }
  const name = el => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase())
  // intentionally off-screen / scrolling strips are fine
  const skip = el => el.closest('.mm-fan, .mx-tray-strip, .pc-chips, .ui-overlay.leaving, .pt-exit, .bd-scene, [aria-hidden=true], .sr-only, .cs-rays')
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || skip(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 || r.left < -1) out.push({ kind: 'за экраном', el: name(el), text: (el.innerText || '').trim().slice(0, 40), x: [Math.round(r.left), Math.round(r.right)] })
    else {
      // cut by a clipping ancestor (overflow hidden/auto) while still on screen
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.overflowX === 'visible') continue
        const ar = a.getBoundingClientRect()
        if (r.right > ar.right + 2 || r.left < ar.left - 2) out.push({ kind: 'обрезано контейнером', el: name(el), text: (el.innerText || '').trim().slice(0, 40), x: [Math.round(r.left), Math.round(r.right)], box: name(a) })
        break
      }
    }
    // own text clipped by its own box (no ellipsis = text silently cut)
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    if (hasText) {
      const cs = getComputedStyle(el)
      const clipX = el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible'
      const clipY = el.scrollHeight > el.clientHeight + 2 && cs.overflowY !== 'visible' && cs.webkitLineClamp === 'none'
      if ((clipX && cs.textOverflow !== 'ellipsis') || clipY) out.push({ kind: 'текст обрезан', el: name(el), text: el.innerText.trim().slice(0, 40) })
    }
  }
  // de-dup parents that repeat the child's issue
  const seen = new Set()
  return out.filter(o => { const k = o.kind + o.text; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 25)
}

async function main() {
  if (!args.includes('--no-build')) { process.stdout.write('Сборка клиента… '); buildClient(); console.log('готово') }
  const server = await startServer(4318)
  const browser = await launchBrowser()
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
  const all = []
  try {
    for (const [sizeName, s] of Object.entries(SIZES)) for (const lang of LANGS) {
      const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.mobile, hasTouch: s.mobile, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.addInitScript(l => { try { localStorage.setItem('chessplus_lang', l) } catch {} }, lang)
      const issues = []
      const check = async (screen) => {
        await sleep(450)
        const found = await page.evaluate(scan)
        if (found.length) {
          const file = `${sizeName}-${lang}-${screen.replace(/\W+/g, '_')}.png`
          await page.screenshot({ path: path.join(OUT, file) })
          for (const f of found) issues.push({ size: sizeName, lang, screen, ...f, file })
        }
      }
      const step = async (screen, fn) => { try { await fn(); await check(screen) } catch (e) { issues.push({ size: sizeName, lang, screen, kind: 'шаг не прошёл', el: '', text: String(e.message).split('\n')[0].slice(0, 80) }) } }
      const close = async () => { await page.keyboard.press('Escape'); await sleep(300) }
      await page.goto(server.url + '/'); await sleep(900)
      await step('меню', async () => {})
      await step('как играть · партия', async () => { await page.click('[data-testid=menu-howto]') })
      await step('как играть · карты', async () => { await page.locator('.htp-tabs [role=tab]').nth(1).click(); await page.locator('.htp-card').first().click() })
      await step('как играть · доски', async () => { await page.locator('.htp-tabs [role=tab]').nth(2).click() })
      await close()
      await step('настройки', async () => { await page.click('.mm-top [data-testid=settings-btn]') })
      await close()
      await step('что нового', async () => { await page.click('[data-testid=menu-news]') })
      await close()
      await step('имя игрока', async () => { await page.click('.mm-top [data-testid=nick-btn]') })
      await close()
      await step('против ИИ', async () => { await page.click('[data-testid=menu-bot]') })
      await close()
      await page.goto(server.url + '/'); await sleep(700)
      await step('игра по сети', async () => { await page.click('[data-testid=menu-online]'); await page.locator('[data-testid=create-lobby]').waitFor() })
      await step('новое лобби', async () => { await page.click('[data-testid=create-lobby]') })
      await step('ожидание соперника', async () => { await page.click('[data-testid=create-submit]'); await page.locator('[data-testid=room-code]').waitFor() })
      await page.click('[data-testid=wait-back]').catch(() => {}); await sleep(500)
      await page.goto(server.url + '/sandbox'); await sleep(900)
      await step('песочница', async () => {})
      await step('песочница · карта', async () => {
        const tile = page.locator('.mx-tray .cd-tile:visible, .mx-right .cd-row:visible').first()
        await tile.click()
      })
      // recruit + battle vs the bot
      await page.goto(server.url + '/'); await sleep(800)
      await page.click('[data-testid=menu-bot]'); await sleep(400)
      await page.click('[data-testid=bot-start]')
      await page.locator('[data-testid=board][data-my-turn="1"]').waitFor({ timeout: 15000 }).catch(() => {})
      await step('набор', async () => {})
      await step('набор · выбор фигуры', async () => {
        const sq = await page.evaluate(() => document.querySelector('.bd-cell.can')?.dataset.square)
        await page.locator(`.bd-cell[data-square="${sq}"]`).click({ force: true })
        await page.locator('.pk-pop').waitFor({ timeout: 3000 })
      })
      await page.locator('[data-testid=recruit-confirm]').click().catch(() => {})
      await page.locator('[data-testid=board][data-my-turn="1"]').waitFor({ timeout: 15000 }).catch(() => {})
      await step('набор · карта', async () => {
        await page.locator('.mx-tray .cd-tile:not(.off):visible, .mx-right .cd-row:not(.off):visible').first().click()
      })
      for (let i = 0; i < 40 && !(await page.locator('[data-testid=surrender-btn]').count()); i++) {
        const done = page.locator('[data-testid=recruit-done]')
        if (await done.isEnabled().catch(() => false)) await done.click().catch(() => {})
        await sleep(400)
      }
      await sleep(2200)
      await step('бой', async () => {})
      // the bot may already have won (kings have one life): then the round
      // result is the screen to check, journal / surrender are not reachable
      const over = await page.locator('.ui-overlay:not(.leaving) .rs-card').count()
      if (over) await step('итог раунда', async () => {})
      else {
        await step('бой · журнал', async () => {
          if (await page.locator('[data-testid=log-btn]:visible').count()) await page.click('[data-testid=log-btn]')
        })
        // the phone journal is a sheet with its own close button
        await page.locator('.bt-log-sheet .ui-modal-close').click({ timeout: 2000 }).catch(() => close())
        await sleep(400)
        await step('бой · сдаться?', async () => {
          await page.locator('[data-testid=surrender-btn]:visible').first().click({ timeout: 4000 })
        })
        await close()
      }
      all.push(...issues)
      console.log(`${sizeName} ${lang}: ${issues.length ? issues.length + ' проблем' : 'ок'}`)
      for (const i of issues) console.log(`   ✗ [${i.screen}] ${i.kind}: ${i.el} «${i.text}»${i.x ? ' x=' + i.x : ''}`)
      await ctx.close()
    }
  } finally {
    await browser.close(); server.proc.kill()
  }
  fs.writeFileSync(path.join(OUT, 'issues.json'), JSON.stringify(all, null, 1))
  console.log(`\nИтого проблем: ${all.length}. Скриншоты: ${OUT}`)
  process.exit(all.length ? 1 : 0)
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error(e); process.exit(2) })
