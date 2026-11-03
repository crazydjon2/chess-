#!/usr/bin/env node
// Chess+ UI click-through tester — see tools/README.md.
//
//   node tools/ui-e2e/run.js                 # desktop + phone, all scenarios
//   node tools/ui-e2e/run.js --all-profiles  # + laptop, small phone, tablet
//   node tools/ui-e2e/run.js --headed        # watch it play
//   node tools/ui-e2e/run.js --only online   # one scenario (menu|online|invite|monkey)
//   node tools/ui-e2e/run.js --no-build      # reuse client/dist
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildClient, startServer, launchBrowser, Recorder, PROFILES } from './lib/harness.js'
import * as S from './lib/scenarios.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = k => args.includes('--' + k)
const val = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null }

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function renderReport(rec, meta) {
  const failed = rec.steps.filter(s => !s.ok)
  const dedupe = list => {
    const m = new Map()
    for (const x of list) { const k = x.kind + '|' + x.text; const e = m.get(k) ?? { ...x, where: new Set(), count: 0 }; e.where.add(x.where); e.count++; m.set(k, e) }
    return [...m.values()]
  }
  const errs = dedupe(rec.errors), layout = dedupe(rec.layout)
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI-тест Chess+</title><style>
:root{--bg:#f7f2e8;--fg:#241708;--muted:#7a6a55;--card:#fffaf0;--line:#e3d8c3;--ok:#1e8449;--bad:#c0392b;--warn:#d68910}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1712;--fg:#f1e9da;--muted:#b3a58e;--card:#252019;--line:#3a3227;--ok:#58d68d;--bad:#ec7063}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
header,section{max-width:1100px;margin:0 auto;padding:16px}section{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:14px auto}
h1{font-size:24px;margin:8px 0 2px}h2{font-size:19px;margin:0 0 10px}.meta{color:var(--muted);margin:0}
.ok{color:var(--ok);font-weight:700}.bad{color:var(--bad);font-weight:700}.warn{color:var(--warn);font-weight:700}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted)}
img{max-width:220px;border:1px solid var(--line);border-radius:6px}pre{white-space:pre-wrap;font-size:12px;margin:4px 0;color:var(--muted)}
.shots{display:flex;flex-wrap:wrap;gap:10px}.shots figure{margin:0;font-size:12px;color:var(--muted);max-width:220px}
</style></head><body>
<header><h1>UI-тест Chess+</h1><p class="meta">${esc(meta.date)} · профили: ${esc(meta.profiles.join(', '))} · ${Math.round(meta.seconds)} с · шагов ${rec.steps.length}: <span class="ok">${rec.steps.length - failed.length} прошло</span>, <span class="${failed.length ? 'bad' : 'ok'}">${failed.length} упало</span> · ошибок JS/консоли: <span class="${errs.length ? 'bad' : 'ok'}">${errs.length}</span> · проблем вёрстки: <span class="${layout.length ? 'warn' : 'ok'}">${layout.length}</span></p></header>
${failed.length ? `<section><h2>Упавшие шаги</h2><div class="tw"><table><tr><th>Сценарий</th><th>Шаг</th><th>Ошибка</th><th>Скриншот</th></tr>${failed.map(s => `<tr><td>${esc(s.scenario)}</td><td>${esc(s.name)}</td><td><pre>${esc(s.error)}</pre></td><td>${s.shot ? `<a href="${s.shot}"><img src="${s.shot}"></a>` : ''}</td></tr>`).join('')}</table></div></section>` : ''}
${errs.length ? `<section><h2>Ошибки в браузере</h2><div class="tw"><table><tr><th>Тип</th><th>Текст</th><th>Где</th><th>Раз</th></tr>${errs.map(e => `<tr><td>${esc(e.kind)}</td><td><pre>${esc(e.text)}</pre></td><td>${esc([...e.where].join(', '))}</td><td>${e.count}</td></tr>`).join('')}</table></div></section>` : ''}
${layout.length ? `<section><h2>Вёрстка и удобство</h2><div class="tw"><table><tr><th>Проблема</th><th>Где</th><th>Раз</th></tr>${layout.map(e => `<tr><td>${esc(e.text)}</td><td>${esc([...e.where].join(', '))}</td><td>${e.count}</td></tr>`).join('')}</table></div></section>` : ''}
<section><h2>Все шаги</h2><div class="tw"><table><tr><th></th><th>Сценарий</th><th>Шаг</th><th>мс</th></tr>${rec.steps.map(s => `<tr><td class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '✓' : '✗'}</td><td>${esc(s.scenario)}</td><td>${esc(s.name)}</td><td>${s.ms}</td></tr>`).join('')}</table></div>
${rec.notes?.length ? `<p>${rec.notes.map(esc).join('<br>')}</p>` : ''}</section>
<section><h2>Скриншоты</h2><div class="shots">${fs.readdirSync(path.join(rec.dir, 'shots')).map(f => `<figure><a href="shots/${f}"><img src="shots/${f}" loading="lazy"></a><figcaption>${esc(f)}</figcaption></figure>`).join('')}</div></section>
</body></html>`
}

async function main() {
  const t0 = Date.now()
  const profiles = val('profiles')?.split(',') ?? (flag('all-profiles') ? Object.keys(PROFILES) : ['desktop', 'mobile'])
  const only = val('only')
  const port = Number(val('port') ?? 4317)
  const seed = Number(val('seed') ?? 1)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(HERE, 'reports', stamp)
  const rec = new Recorder(dir)

  if (!flag('no-build')) { process.stdout.write('Сборка клиента… '); buildClient(); console.log('готово') }
  const server = await startServer(port)
  console.log('Сервер:', server.url)
  const browser = await launchBrowser({ headed: flag('headed') })
  const rng = mulberry32(seed)
  try {
    for (const profile of profiles) {
      console.log(`Профиль ${profile}:`)
      const run = async (name, fn) => {
        if (only && only !== name) return
        console.log('  ·', name)
        try { await fn() } catch (e) { console.log(`    сценарий прерван: ${String(e?.message ?? e).split('\n')[0]}`) }
      }
      await run('menu', () => S.menuTour(browser, server.url, profile, rec, rng))
      await run('online', () => S.onlineMatch(browser, server.url, profile, rec, rng, { letPlacementTimerRun: profile === 'desktop' }))
      await run('invite', () => S.inviteLink(browser, server.url, profile, rec))
      await run('monkey', () => S.monkey(browser, server.url, profile, rec, rng, { steps: Number(val('monkey') ?? 150) }))
    }
  } finally {
    await browser.close()
    server.proc.kill()
  }
  const serverErrors = server.logs.join('').split('\n').filter(l => /error|failed|Error/.test(l))
  for (const l of serverErrors) rec.errors.push({ where: 'server', kind: 'server-log', text: l, url: '' })

  fs.writeFileSync(path.join(dir, 'report.html'), renderReport(rec, { date: new Date().toLocaleString('ru-RU'), profiles, seconds: (Date.now() - t0) / 1000 }))
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ steps: rec.steps, errors: rec.errors, layout: rec.layout, notes: rec.notes }, null, 1))
  const failed = rec.steps.filter(s => !s.ok)
  console.log(`\nШагов ${rec.steps.length}, упало ${failed.length}, ошибок JS/консоли ${rec.errors.length}, проблем вёрстки ${rec.layout.length}`)
  for (const s of failed) console.log(`  ✗ ${s.scenario} › ${s.name}: ${s.error.split('\n')[0]}`)
  console.log('Отчёт:', path.relative(process.cwd(), path.join(dir, 'report.html')))
  process.exit(failed.length || rec.errors.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
