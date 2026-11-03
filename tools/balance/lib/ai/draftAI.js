// Draft policies. Every one of them reads the catalog from the game itself
// (PIECE_TYPES / CARD_IDS / real prices via nextItemCost), so new pieces or
// cards are drafted automatically.
import fs from 'fs'
import { draft, PIECE_TYPES, CARD_IDS, itemCost } from '../engine.js'

const asPiece = pieceType => ({ kind: 'piece', pieceType })
const asCard = cardId => ({ kind: 'card', cardId })

function affordable(ds, me) {
  const budget = ds.budgets[me]
  const room = ds.picks[me].pieces.length < ds.maxPieces
  const out = []
  if (room) for (const t of PIECE_TYPES) { const it = asPiece(t); if (itemCost(ds, me, it) <= budget) out.push(it) }
  for (const c of CARD_IDS) { const it = asCard(c); if (itemCost(ds, me, it) <= budget) out.push(it) }
  return out
}

// Policy = (ds, me, state, rng) => item | null (null = "I'm done").
export const DRAFT_POLICIES = {
  // Uniformly random affordable item: produces wildly varied armies — the
  // raw material for measuring what each item is actually worth.
  random: (ds, me, st, rng) => {
    const opts = affordable(ds, me)
    if (!opts.length) return null
    // stop early sometimes so "small army + saved nothing" shapes appear too
    // (also gives the item-value model the unspent-coin variation it needs)
    if (ds.picks[me].pieces.length > 2 && rng() < 0.1) return null
    return opts[Math.floor(rng() * opts.length)]
  },
  // Random, but pieces 3x as likely as cards — closer to how people draft.
  randomPieces: (ds, me, st, rng) => {
    const opts = affordable(ds, me)
    if (!opts.length) return null
    const w = opts.map(o => (o.kind === 'piece' ? 3 : 1))
    let r = rng() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i] }
    return opts.at(-1)
  },
}

// Ordered wish list, cycled while affordable; `cards` bought first.
export function wishlist(pieces, cards = [], fallback = ['pawn', 'knight', 'bishop']) {
  return (ds, me, st) => {
    st.ci ??= 0; st.pi ??= 0
    const budget = ds.budgets[me]
    while (st.ci < cards.length) {
      const it = asCard(cards[st.ci++])
      if (CARD_IDS.includes(it.cardId) && itemCost(ds, me, it) <= budget) return it
    }
    if (ds.picks[me].pieces.length >= ds.maxPieces) return null
    for (let k = 0; k < pieces.length; k++) {
      const it = asPiece(pieces[st.pi++ % pieces.length])
      if (itemCost(ds, me, it) <= budget) return it
    }
    for (const t of fallback) { const it = asPiece(t); if (itemCost(ds, me, it) <= budget) return it }
    return null
  }
}

// Piece plans: what an army is built around (cycled while affordable).
export const PIECE_PLANS = {
  balanced: ['rook', 'knight', 'bishop', 'pawn', 'pawn', 'pawn'],
  heavy: ['queen', 'rook', 'rook', 'pawn'],
  queens: ['queen', 'queen'],
  minors: ['knight', 'bishop', 'knight', 'bishop'],
  pawns: ['pawn'],
  rooks: ['rook'],
  knights: ['knight'],
  bishops: ['bishop'],
}
const PLAN_FALLBACK = { heavy: ['pawn', 'knight'], queens: ['pawn'], minors: ['pawn'], pawns: ['knight', 'bishop'], rooks: ['pawn', 'knight'], knights: ['pawn'], bishops: ['pawn'] }

export const ARCHETYPES = Object.fromEntries(Object.entries(PIECE_PLANS).map(([k, list]) => [k, wishlist(list, [], PLAN_FALLBACK[k])]))

// The meta roster: every piece plan, every card on a balanced army, every
// card on a contrasting army, a couple of two-card plans and the
// human-style drafters. New cards join automatically.
export function metaRoster() {
  const plans = Object.keys(PIECE_PLANS)
  const others = plans.filter(p => p !== 'balanced')
  const roster = [...plans]
  CARD_IDS.forEach((c, i) => {
    roster.push('balanced+' + c)
    roster.push(others[i % others.length] + '+' + c)
  })
  roster.push('balanced+freeze+smoke_screen', 'heavy+shield+meteor')
  roster.push('human:aggro', 'human:defensive', 'human:control')
  return [...new Set(roster)].filter(n => n.split('+').slice(1).every(c => CARD_IDS.includes(c)))
}

// ── Human-style drafting ───────────────────────────────────────────────
// How a person drafts: looks at the board (shown on the draft screen),
// wants a king shield of a couple of pawns, values long-range pieces more
// on open boards and knights on cramped ones, answers what the opponent is
// buying, buys a card or two that fit, and stops wanting more of the same.
//
// What an item is WORTH comes from measurement, not taste: values.json
// holds each item's win contribution per copy, as the lab last measured it
// (see run.js --save-values). A temperament only tilts those numbers. With
// prices set so that worth/price is about equal for everything, the choice
// is decided by style, board and the opponent — not by one obvious buy.
const PERSONAS = {
  aggro: { maxCards: 2, tilt: { queen: 1.25, rook: 1.2, bishop: 1.05, meteor: 1.25, unstable: 1.2, shield: 1.1, pawn: 0.85 } },
  defensive: { maxCards: 2, tilt: { pawn: 1.2, knight: 1.15, bishop: 1.15, shield: 1.3, barricade: 1.3, smoke_screen: 1.2, freeze: 1.1, queen: 0.85 } },
  control: { maxCards: 3, tilt: { smoke_screen: 1.3, freeze: 1.3, unstable: 1.25, meteor: 1.2, add_cell: 1.15, knight: 1.05 } },
}
// Fallback worth (≈ pawn units) when no measurement exists for an item.
const FALLBACK = { pawn: 1, knight: 3, bishop: 3.2, rook: 5, queen: 9 }

let measured = null
function measuredValues() {
  if (measured) return measured
  try {
    const raw = JSON.parse(fs.readFileSync(new URL('../../values.json', import.meta.url), 'utf8'))
    measured = raw.values ?? {}
  } catch { measured = {} }
  return measured
}

// Worth of one copy in "price units": measured win contribution converted
// at the measured average wins-per-coin, so an item priced fairly has
// worth ≈ its price. Without a measurement: the fallback table.
function baseWorth(key) {
  const m = measuredValues()
  if (m[key] && m.__perCoin > 0) return Math.max(0.05, m[key] / m.__perCoin)
  const k = key.startsWith('card:') ? key.slice(5) : key
  return (FALLBACK[k] ?? 1.5) * 2.4
}

function boardOpenness(pattern) {
  if (!pattern) return 0.7
  const middle = pattern.cols * Math.max(1, pattern.rows - 4)
  return 1 - (pattern.blockedCells?.length ?? 0) / middle
}

export function humanDrafter(personaName) {
  const P = PERSONAS[personaName]
  if (!P) throw new Error('unknown persona ' + personaName)
  return (ds, me, st, rng, ctx = {}) => {
    const open = boardOpenness(ctx.pattern)
    const mine = ds.picks[me], theirs = ds.picks[me === 'white' ? 'black' : 'white']
    const count = (list, x) => list.filter(y => y === x).length
    const oppHeavy = theirs.pieces.filter(t => t === 'queen' || t === 'rook').length
    const oppMinors = theirs.pieces.filter(t => t === 'knight' || t === 'bishop').length
    const minPieces = Math.ceil(ds.maxPieces / 4)
    const worth = it => {
      const key = it.kind === 'piece' ? it.pieceType : 'card:' + it.cardId
      const id = it.kind === 'piece' ? it.pieceType : it.cardId
      let v = baseWorth(key) * (P.tilt[id] ?? 1)
      if (it.kind === 'piece') {
        const t = it.pieceType, n = count(mine.pieces, t)
        if (t === 'queen' || t === 'rook' || t === 'bishop') v *= 0.85 + 0.3 * open
        if (t === 'knight') v *= 1.2 - 0.3 * open
        if (t === 'pawn') v *= n < 2 ? 1.5 : 1                 // a king shield first
        else v *= Math.pow(t === 'queen' ? 0.7 : 0.85, n)     // less keen on repeats
        if ((t === 'rook' || t === 'queen') && oppMinors >= 3) v *= 1.1
        return v
      }
      const n = count(mine.cards, it.cardId)
      if (mine.cards.length >= P.maxCards) return 0
      if (mine.pieces.length - 1 < minPieces) v *= 0.35         // an army first
      if ((it.cardId === 'meteor' || it.cardId === 'unstable') && oppHeavy) v *= 1 + 0.15 * Math.min(oppHeavy, 2)
      if (it.cardId === 'add_cell' && open < 0.8) v *= 1.4
      return v * Math.pow(0.5, n)
    }
    const opts = affordable(ds, me)
    let best = null, bestScore = 0
    for (const it of opts) {
      const v = worth(it)
      if (v <= 0) continue
      // worth per coin, with real personal variation in taste
      const s = (v / itemCost(ds, me, it)) * (1 + (rng() - 0.5) * 0.5)
      if (s > bestScore) { bestScore = s; best = it }
    }
    return best
  }
}

export function resolveDraftPolicy(name) {
  if (DRAFT_POLICIES[name]) return DRAFT_POLICIES[name]
  if (ARCHETYPES[name]) return ARCHETYPES[name]
  if (name.startsWith('human:')) return humanDrafter(name.slice(6))
  // "balanced+meteor" / "heavy+shield+freeze": piece plan plus cards bought first
  const [base, ...cards] = name.split('+')
  if (PIECE_PLANS[base]) return wishlist(PIECE_PLANS[base], cards, PLAN_FALLBACK[base])
  throw new Error('unknown draft policy ' + name)
}

// `pattern` is the board the round will be played on — shown on the real
// draft screen, so human-style drafters may take it into account.
export function runDraft(round, policies, rng, firstColor = 'white', pattern = null) {
  let ds = draft.createDraftState(round, firstColor, 0)
  const st = { white: {}, black: {} }
  for (let guard = 0; guard < 300 && !(ds.done.white && ds.done.black); guard++) {
    const me = ds.turn
    const it = policies[me](ds, me, st[me], rng, { pattern })
    let res = it ? draft.submitPick(ds, me, it, 0) : draft.submitDone(ds, me, 0)
    if (res.error) res = draft.submitDone(ds, me, 0)
    if (res.error) throw new Error('draft stuck: ' + res.error)
    ds = res.draftState
  }
  return ds
}
