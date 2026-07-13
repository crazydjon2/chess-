// Patch notes shown on the main menu (see rendering/PatchNotes.jsx). Only
// add a new entry when the user explicitly asks for one — not automatically
// after every fix; iterating on the same feature should stay ONE entry
// describing the end state, not a separate entry per iteration. Add to the
// TOP of this array; never edit an old entry after the fact. `id` must be
// unique and never reused (App.jsx keys the "unseen" badge off
// PATCH_NOTES[0].id). Keep `changes` bullets short — one clause each, no
// explanations.
//
// Entries are tied to a `version`, not a date — bump by 1 for each new
// entry (highest version = top of the array = newest). Versions are just a
// running counter, not semver; no need to reason about major/minor/patch.
export const PATCH_NOTES = [
  {
    id: 'battle-log',
    version: 'v13',
    title: 'Журнал боя',
    glyph: '📜',
    accent: '#60a5fa',
    changes: [
      'Кликабельный журнал: ходы и карты, можно посмотреть доску на любой момент раунда.',
      'Доступен и на экране итогов раунда.'
    ],
  },
  {
    id: 'draft-duplicate-pricing',
    version: 'v12',
    title: 'Повторная покупка дорожает',
    glyph: '📈',
    accent: '#fbbf24',
    changes: [
      'Каждая следующая копия одной фигуры или карты в раунде стоит дороже.',
    ],
  },
  {
    id: 'draft-redesign',
    version: 'v11',
    title: 'Драфт без банов — закупка по очереди',
    glyph: '👁',
    accent: '#f472b6',
    changes: [
      'Баны убраны — сразу закупка.',
      'Выбирайте по очереди: одна фигура или карта за ход, сопернику видно сразу.',
    ],
  },
  {
    id: 'analysis-window',
    version: 'v10',
    title: 'Бесплатный анализ перед первым ходом',
    glyph: '🔍',
    accent: '#7dd3fc',
    changes: [
      'Свой первый ход в раунде каждая сторона может обдумывать бесплатно (10 сек) — со своим индикатором «Анализ».',
    ],
  },
  {
    id: 'require-pieces-in-draft',
    version: 'v9',
    title: 'Нельзя закончить закупку без фигур',
    glyph: '♟',
    accent: '#e8c96a',
    changes: [
      'Закупка теперь требует хотя бы одну фигуру в корзине.',
    ],
  },
  {
    id: 'premoves',
    version: 'v8',
    title: 'Префер ходов',
    glyph: '⏩',
    accent: '#5a96dc',
    changes: [
      'Можно заранее выбрать ход, пока ходит соперник — сыграет сам в свой черёд.'
    ],
  },
  {
    id: 'clock-increment',
    version: 'v7',
    title: 'Бонус времени за ход',
    glyph: '⏱',
    accent: '#e8c96a',
    changes: [
      'Часы пополняются после каждого хода: +3/+4/+5 сек по раундам.',
    ],
  },
  {
    id: 'no-moves-checks-cards',
    version: 'v6',
    title: 'Поражение «нет ходов» учитывает карты',
    glyph: '🃏',
    accent: '#3af3a0',
    changes: [
      'Если карта в руке может спасти позицию — поражение «нет ходов» не засчитывается.',
      'Нет спасающей карты — поражение как раньше.',
    ],
  },
  {
    id: 'meteor-kills-count',
    version: 'v5',
    title: 'Убийство метеором — тоже сруб',
    glyph: '☄',
    accent: '#d35400',
    changes: [
      'Метеор теперь даёт монеты, идёт в трей срубленных и годится для некромантии.',
      'Дружественный огонь монет не даёт.',
    ],
  },
  {
    id: 'draft-caps-and-fog-fix',
    version: 'v4',
    title: 'Лимит фигур и починка дымовой завесы',
    glyph: '🛡',
    accent: '#7dd3fc',
    changes: [
      'Дымовая завеса больше не тает от собственных ходов.',
      'Фигур в драфте — не больше, чем клеток на вашей половине доски.',
      'Счётчик «Фигуры: X / Y» на закупке.',
      'На расстановке видно и карты.',
    ],
  },
  {
    id: 'fresh-rounds',
    version: 'v3',
    title: 'Раунды не переносят прогресс',
    glyph: '🔄',
    accent: '#3af3a0',
    changes: [
      'Фигуры и карты больше не переносятся между раундами.',
      'Деньги по-прежнему обнуляются каждый раунд.',
    ],
  },
  {
    id: 'necromancy-unstable',
    version: 'v2',
    title: 'Некромантия и нестабильная фигура',
    glyph: '✨',
    accent: '#a855f7',
    changes: [
      'Новая карта «Нестабильная фигура» — 6 ходов случайных превращений.',
      'Некромантия поднимает срубленных вами соперников, не ваши потери.',
      'Бюджет раунда виден уже в фазе бана.',
    ],
  },
  {
    id: 'draft-battle-rework',
    version: 'v1',
    title: 'Переработка драфта и боя',
    glyph: '⚔',
    accent: '#c9a850',
    changes: [
      'Драфт: слепые баны, затем свободная закупка.',
      '«Мина заморозки» — невидимая ловушка вместо мгновенной заморозки.',
      '«Прирост HP» заменён на «Некромантию».',
      'Лимит ходов заменён на настоящие шахматные часы.',
      'Нет ходов или времени — поражение сразу.',
      'Кнопки подтверждения закреплены внизу экрана.',
      'Убран откат хода.',
    ],
  },
]
