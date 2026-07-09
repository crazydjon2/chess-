import { BAN_COUNT_BY_ROUND, BUDGET_BY_ROUND } from './draftPools.js'
import { SHOP_PIECE_TYPES, shopPieceCost } from './economy.js'
import { CARD_DEFS } from './cards.js'
import { HOME_CAPACITY_BY_ROUND } from './boardPatterns.js'

// The full catalog — every piece type and every card is buyable from round
// 1 on. There's no rolled/scarce pool any more: the only things that limit
// what you can get are your budget and what the opponent banned for you
// (see below). Supply is unlimited — buying a knight doesn't make it
// unavailable to the opponent or to you again.
export const ALL_PIECE_TYPES = SHOP_PIECE_TYPES
export const ALL_CARD_IDS = Object.keys(CARD_DEFS)

// Pawns can never be banned — a hard rule, not a balance knob. Bans target
// a whole TYPE (not a single copy, since supply is unlimited), so without
// this floor a well-aimed set of bans could strip every affordable piece
// type from a side and leave them unable to place a single piece, which is
// an instant loss under elimination rules (see chess.js). Keeping pawn
// always buyable guarantees a side can always field SOME army.
const UNBANNABLE_PIECE = 'pawn'

function targetKey(target) {
  return target.kind === 'piece' ? `piece:${target.pieceType}` : `card:${target.cardId}`
}

function isValidCatalogTarget(target) {
  if (target?.kind === 'piece') return ALL_PIECE_TYPES.includes(target.pieceType)
  if (target?.kind === 'card') return ALL_CARD_IDS.includes(target.cardId)
  return false
}

function itemCost(item) {
  return item.kind === 'piece' ? shopPieceCost(item.pieceType) : CARD_DEFS[item.cardId].cost
}

// `firstColor` no longer gates any turn order (both sides ban and buy
// blind/simultaneously) — it's kept purely as a persistent label so
// matchEngine.js can keep announcing the same physical player "first"
// round to round (see applyRoundResult's comment on why that matters for
// alternation once colors start swapping).
//
// The budget is always the round's flat BUDGET_BY_ROUND — nothing persists
// between rounds (see matchEngine.js): every round is a fresh draft, and
// whatever pieces/cards survived the previous round's battle simply don't
// come back. Money is a strictly this-round resource: it funds this
// round's buy phase, and whatever's left over becomes this round's
// starting battle coins (see tryDraftBuy/tryPlacement) — gone once the
// round ends, same as captured coins earned mid-battle.
export function createDraftState(round, firstColor = 'white') {
  const secondColor = firstColor === 'white' ? 'black' : 'white'
  const budget = BUDGET_BY_ROUND[round]
  return {
    round,
    firstColor,
    secondColor,
    phase: 'ban', // 'ban' -> 'buy'
    banCount: BAN_COUNT_BY_ROUND[round],
    bans: { white: null, black: null }, // null until that color submits; array of targets once submitted
    budgets: { white: budget, black: budget },
    // Hard cap on how many PIECES (not cards) either side may draft this
    // round — see boardPatterns.js's HOME_CAPACITY_BY_ROUND. Buying more
    // than fit on the home ranks would leave hidden placement impossible
    // to ever finish (see submitPurchases below and placementEngine.js).
    maxPieces: HOME_CAPACITY_BY_ROUND[round],
    picks: { white: null, black: null }, // null until that color submits; { pieces: [...], cards: [...] } once submitted
  }
}

function opponentOf(color) {
  return color === 'white' ? 'black' : 'white'
}

// What's banned FOR `color` — i.e. what the OPPONENT chose to deny them.
// Empty until the ban phase is fully resolved (both sides submitted).
export function getBannedTargets(draftState, color) {
  if (draftState.phase === 'ban') return []
  return draftState.bans[opponentOf(color)] ?? []
}

export function isDraftComplete(draftState) {
  return draftState.picks.white !== null && draftState.picks.black !== null
}

// targets = [{ kind: 'piece', pieceType } | { kind: 'card', cardId }, ...],
// exactly draftState.banCount of them, no duplicates, never a pawn. Both
// sides submit blind — the ban phase only resolves (and each side's
// bannedFor becomes visible) once BOTH have submitted, same "hidden until
// both ready" pattern as placement.
export function submitBans(draftState, color, targets) {
  if (draftState.phase !== 'ban') return { error: 'Фаза банов уже завершена' }
  if (draftState.bans[color] !== null) return { error: 'Вы уже отправили баны' }
  if (!Array.isArray(targets) || targets.length !== draftState.banCount) {
    return { error: `Нужно выбрать ровно ${draftState.banCount} бан(а/ов)` }
  }
  for (const t of targets) {
    if (!isValidCatalogTarget(t)) return { error: 'Некорректная цель бана' }
    if (t.kind === 'piece' && t.pieceType === UNBANNABLE_PIECE) return { error: 'Пешку нельзя банить' }
  }
  const keys = targets.map(targetKey)
  if (new Set(keys).size !== keys.length) return { error: 'Нельзя банить одно и то же дважды' }

  const bans = { ...draftState.bans, [color]: targets }
  const phase = bans.white !== null && bans.black !== null ? 'buy' : draftState.phase
  return { draftState: { ...draftState, bans, phase } }
}

// items = [{ kind: 'piece', pieceType } | { kind: 'card', cardId }, ...] —
// the buyer's whole cart at once (no turn order to interleave with, so
// there's nothing gained by submitting one at a time). Duplicates are
// fine and common (supply is unlimited) — buying three pawns is just
// three entries. Validated atomically: every item must be affordable
// together and none may be banned for this color.
export function submitPurchases(draftState, color, items) {
  if (draftState.phase !== 'buy') return { error: 'Сейчас не фаза покупок' }
  if (draftState.picks[color] !== null) return { error: 'Вы уже отправили закупку' }
  if (!Array.isArray(items)) return { error: 'Некорректная закупка' }

  const banned = new Set(getBannedTargets(draftState, color).map(targetKey))
  let total = 0
  let pieceCount = 0
  for (const item of items) {
    if (!isValidCatalogTarget(item)) return { error: 'Некорректный товар' }
    if (banned.has(targetKey(item))) return { error: 'Это забанено сопернику для вас' }
    if (item.kind === 'piece') pieceCount++
    total += itemCost(item)
  }
  if (total > draftState.budgets[color]) return { error: 'Недостаточно бюджета' }
  if (pieceCount > draftState.maxPieces) {
    return { error: `На доске только ${draftState.maxPieces} клеток на вашей половине — столько фигур и можно купить` }
  }

  const picksEntry = {
    pieces: items.filter(i => i.kind === 'piece').map(i => i.pieceType),
    cards: items.filter(i => i.kind === 'card').map(i => i.cardId),
  }
  return {
    draftState: {
      ...draftState,
      budgets: { ...draftState.budgets, [color]: draftState.budgets[color] - total },
      picks: { ...draftState.picks, [color]: picksEntry },
    },
  }
}
