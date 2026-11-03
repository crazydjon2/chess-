// Experiment catalog. Each experiment turns into a flat list of jobs (one
// job = one complete simulated round). Everything is enumerated from the
// game's own data — ROUNDS, BOARD_PATTERNS, CARD_IDS, archetypes — so new
// boards/cards/pieces join the experiments without editing this file.
import { ROUNDS, CARD_IDS, boards } from './engine.js'
import { ARCHETYPES, metaRoster } from './ai/draftAI.js'

const both = (cfg, a, b) => [
  { ...cfg, draft: { white: a, black: b }, pair: [a, b], aIs: 'white' },
  { ...cfg, draft: { white: b, black: a }, pair: [a, b], aIs: 'black' },
]

export const EXPERIMENTS = {
  // Identical armies: isolates first-move advantage and per-board behaviour.
  mirror: {
    title: 'Зеркальные партии (одинаковые армии)',
    jobs: n => {
      const out = []
      for (const round of ROUNDS) for (const pattern of boards.BOARD_PATTERNS[round])
        for (let i = 0; i < n; i++) out.push({ round, pattern, draft: { white: 'balanced', black: 'balanced' } })
      return out
    },
  },
  // Random drafts: raw material for "what is each item really worth".
  items: {
    title: 'Случайные армии (ценность каждого предмета)',
    jobs: n => {
      const out = []
      // A regression over ~13 items needs a lot of games to be precise.
      for (const round of ROUNDS) for (let i = 0; i < n * 25; i++) {
        const pol = i % 3 === 0 ? 'random' : 'randomPieces'
        out.push({ round, draft: { white: pol, black: pol } })
      }
      return out
    },
  },
  // Every archetype against every other, both colours.
  archetypes: {
    title: 'Стратегии драфта друг против друга',
    jobs: n => {
      // fixed recipes plus the three human-style drafters
      const names = [...Object.keys(ARCHETYPES), 'human:aggro', 'human:defensive', 'human:control']
      const out = []
      for (const round of ROUNDS) for (let x = 0; x < names.length; x++) for (let y = x + 1; y < names.length; y++)
        for (let i = 0; i < n; i++) out.push(...both({ round }, names[x], names[y]))
      return out
    },
  },
  // The whole meta: every strategy (piece plans × cards, human drafters)
  // against every other, both colours, every round.
  meta: {
    title: 'Мета: все стратегии против всех',
    jobs: n => {
      const names = metaRoster()
      const out = []
      for (const round of ROUNDS) for (let x = 0; x < names.length; x++) for (let y = x + 1; y < names.length; y++)
        for (let i = 0; i < n; i++) out.push(...both({ round }, names[x], names[y]))
      return out
    },
  },
  // Each card vs the same army that skipped it (money goes to pieces).
  cards: {
    title: 'Каждая карта против той же армии без неё',
    jobs: n => {
      const out = []
      for (const round of ROUNDS) for (const id of CARD_IDS) for (let i = 0; i < n; i++)
        out.push(...both({ round, cardUnderTest: id }, 'balanced+' + id, 'balanced'))
      return out
    },
  },
  // Placement styles, and who gets the last word in the live placement.
  placement: {
    title: 'Расстановка: стиль и кто правит последним',
    jobs: n => {
      const out = []
      for (const round of ROUNDS) for (let i = 0; i < n; i++) {
        for (const style of ['corner', 'random']) {
          out.push({ round, draft: { white: 'balanced', black: 'balanced' }, placement: { styles: { white: style, black: 'king-back' } }, pair: [style, 'king-back'], aIs: 'white' })
          out.push({ round, draft: { white: 'balanced', black: 'balanced' }, placement: { styles: { white: 'king-back', black: style } }, pair: [style, 'king-back'], aIs: 'black' })
        }
        for (const last of ['white', 'black'])
          out.push({ round, draft: { white: 'balanced', black: 'balanced' }, placement: { lastEditor: last }, lastEditor: last })
      }
      return out
    },
  },
  // Does skill matter? A stronger AI should beat a weaker one clearly —
  // if it doesn't, the outcome is mostly luck.
  skill: {
    title: 'Влияние умения (сильный ИИ против слабого)',
    jobs: n => {
      const out = []
      for (const round of ROUNDS) for (let i = 0; i < n; i++) {
        out.push({ round, draft: { white: 'balanced', black: 'balanced' }, ai: { white: 'strong', black: 'weak' }, pair: ['strong', 'weak'], aIs: 'white' })
        out.push({ round, draft: { white: 'balanced', black: 'balanced' }, ai: { white: 'weak', black: 'strong' }, pair: ['strong', 'weak'], aIs: 'black' })
      }
      return out
    },
  },
  // Chaos: random drafts, weak noisy AI, random placement — only to shake
  // out engine errors (invariants are checked on every action).
  fuzz: {
    title: 'Фаззинг движка',
    jobs: n => {
      const out = []
      for (const round of ROUNDS) for (let i = 0; i < n * 10; i++)
        out.push({ round, draft: { white: 'random', black: 'random' }, ai: { white: 'chaos', black: 'chaos' }, placement: { styles: { white: 'random', black: 'random' }, smart: false } })
      return out
    },
  },
}

export const DEFAULT_SET = ['mirror', 'items', 'archetypes', 'cards', 'placement', 'skill', 'fuzz']
