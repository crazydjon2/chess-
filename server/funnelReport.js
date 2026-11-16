// /admin/funnel and /admin/feedback — read from the tables analytics.js and
// feedback.js write.
import { esc, num, pct, date, table, bar, page } from './reportKit.js'
import { today } from './analytics.js'

const DAY = 864e5
const shift = (day, n) => today(Date.parse(day) + n * DAY)

// Funnel steps, in order. `any` = a visitor counts if they did any of these.
const HUMAN_STEPS = [
  ['Зашли на сайт', ['visit']],
  ['Открыли «Играть онлайн»', ['online_open']],
  ['Создали или вошли в комнату', ['room_create', 'room_join']],
  ['Начали матч с человеком', ['match_start']],
  ['Доиграли раунд', ['round_done']],
  ['Доиграли матч', ['match_done']],
  ['Сыграли реванш', ['rematch']],
]
const BOT_STEPS = [
  ['Начали матч с ИИ', ['bot_match_start']],
  ['Доиграли раунд с ИИ', ['bot_round_done']],
  ['Доиграли матч с ИИ', ['bot_match_done']],
]

export function buildFunnelReport(db, { days = 14, now = Date.now() } = {}) {
  const to = today(now)
  const from = shift(to, -(days - 1))

  const uniq = (events, dayFrom = from, dayTo = to) => db.prepare(
    `SELECT COUNT(DISTINCT vid) n FROM daily WHERE day BETWEEN ? AND ? AND event IN (${events.map(() => '?').join(',')})`,
  ).get(dayFrom, dayTo, ...events).n

  const visitors = uniq(['visit'])
  const funnel = (steps) => steps.map(([label, events]) => {
    const n = uniq(events)
    return [esc(label), n, visitors ? bar(n / visitors) : '—']
  })

  // Per-day table.
  const perDay = new Map()
  for (const r of db.prepare('SELECT day, event, COUNT(DISTINCT vid) u FROM daily WHERE day BETWEEN ? AND ? GROUP BY day, event').all(from, to)) {
    if (!perDay.has(r.day)) perDay.set(r.day, {})
    perDay.get(r.day)[r.event] = r.u
  }
  const newByDay = Object.fromEntries(db.prepare('SELECT first_day d, COUNT(*) n FROM visitors WHERE first_day BETWEEN ? AND ? GROUP BY first_day').all(from, to).map(r => [r.d, r.n]))
  const dayRows = []
  for (let d = to; d >= from; d = shift(d, -1)) {
    const e = perDay.get(d) ?? {}
    const rooms = uniq(['room_create', 'room_join'], d, d)
    dayRows.push([d, e.visit ?? 0, newByDay[d] ?? 0, e.online_open ?? 0, rooms, e.match_start ?? 0, e.match_done ?? 0, e.bot_match_start ?? 0])
  }

  // Retention: of the visitors first seen on day X, how many came back on X+1 / X+7.
  const cohorts = db.prepare(`
    SELECT v.first_day day, COUNT(*) size,
      SUM(EXISTS(SELECT 1 FROM daily d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+1 day'))) d1,
      SUM(EXISTS(SELECT 1 FROM daily d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+7 day'))) d7,
      SUM(EXISTS(SELECT 1 FROM daily d WHERE d.vid = v.vid AND d.day > v.first_day AND d.day <= date(v.first_day, '+7 day'))) w1
    FROM visitors v WHERE v.first_day BETWEEN ? AND ? GROUP BY v.first_day ORDER BY v.first_day DESC`).all(from, to)
  const mature = (day, n) => shift(day, n) <= to
  const cohortRows = cohorts.map(c => [c.day, c.size,
    mature(c.day, 1) ? pct(c.d1 / c.size) : '—',
    mature(c.day, 7) ? pct(c.d7 / c.size) : '—',
    mature(c.day, 1) ? pct(c.w1 / c.size) : '—'])
  const tot = (k, n) => cohorts.filter(c => mature(c.day, n)).reduce((a, c) => a + c[k], 0)
  const totSize = n => cohorts.filter(c => mature(c.day, n)).reduce((a, c) => a + c.size, 0)

  // Where new visitors come from, and whether they actually play.
  const breakdown = (col) => db.prepare(`
    SELECT COALESCE(NULLIF(v.${col}, ''), '(прямой заход)') k, COUNT(*) n,
      SUM(EXISTS(SELECT 1 FROM daily d WHERE d.vid = v.vid AND d.event IN ('match_start', 'bot_match_start'))) played,
      SUM(EXISTS(SELECT 1 FROM daily d WHERE d.vid = v.vid AND d.day > v.first_day)) back
    FROM visitors v WHERE v.first_day BETWEEN ? AND ? GROUP BY k ORDER BY n DESC LIMIT 30`).all(from, to)
    .map(r => [esc(r.k), r.n, bar(r.played / r.n), pct(r.back / r.n)])

  const s = []
  s.push(`<header><h1>Mischess — воронка</h1><p class="meta">${esc(date(now))} UTC · последние ${days} дн. (${from} — ${to}) · <a href="?days=7">7</a> · <a href="?days=30">30</a> · <a href="?days=90">90</a> дн.</p></header>`)
  s.push(`<section><h2>Воронка</h2><p class="hint">Уникальные посетители за период; доля — от зашедших. Посетитель = браузер (без логина один человек на двух устройствах — два посетителя).</p>${table(['Шаг', 'Посетителей', 'Доля'], funnel(HUMAN_STEPS))}<h3>Игра с ИИ</h3>${table(['Шаг', 'Посетителей', 'Доля'], funnel(BOT_STEPS))}</section>`)
  s.push(`<section><h2>Возвращаются ли</h2><p class="hint">Из тех, кто впервые зашёл в этот день: какая доля вернулась на следующий день (D1), ровно через неделю (D7), хоть раз за неделю. Для браузерной игры D1 ≥ 20% — хорошо.</p>
    <div class="kpis"><div><span>D1</span><b>${pct(tot('d1', 1) / totSize(1))}</b></div><div><span>D7</span><b>${pct(tot('d7', 7) / totSize(7))}</b></div><div><span>Вернулись за неделю</span><b>${pct(tot('w1', 1) / totSize(1))}</b></div></div>
    ${table(['Первый визит', 'Новых', 'D1', 'D7', 'За неделю'], cohortRows)}</section>`)
  s.push(`<section><h2>По дням</h2>${table(['День', 'Посетителей', 'Новых', 'Онлайн', 'Комната', 'Матч с человеком', 'Доиграли матч', 'Матч с ИИ'], dayRows)}</section>`)
  s.push(`<section><h2>Откуда приходят</h2><p class="hint">Новые посетители за период. Чтобы различать свои посты, давай ссылки с меткой: <code>mischess.com/?utm_source=reddit</code>, <code>?utm_source=tiktok</code>…</p>${table(['Источник', 'Новых', 'Начали матч', 'Вернулись'], breakdown('source'))}
    <h3>Устройства</h3>${table(['Устройство', 'Новых', 'Начали матч', 'Вернулись'], breakdown('device'))}
    <h3>Языки</h3>${table(['Язык', 'Новых', 'Начали матч', 'Вернулись'], breakdown('lang'))}</section>`)
  return page('Воронка Mischess', s.join('\n'), '/admin/funnel')
}

export function buildFeedbackPage(db, { limit = 300 } = {}) {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT ?').all(limit)
  const total = db.prepare('SELECT COUNT(*) n FROM feedback').get().n
  const body = rows.length
    ? rows.map(r => `<div class="fb"><p>${esc(r.text)}</p><small>${esc(date(r.ts))} UTC · ${r.contact ? `контакт: <b>${esc(r.contact)}</b> · ` : ''}${esc(r.lang)} · ${esc(r.page)}${r.mailed ? ' · ✉ отправлено' : ''}</small></div>`).join('')
    : '<p>Отзывов пока нет.</p>'
  return page('Отзывы Mischess', `<header><h1>Mischess — отзывы</h1><p class="meta">Всего: ${num(total)}</p></header><section>${body}</section>`, '/admin/feedback')
}
