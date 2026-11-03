// Things that must NEVER be true after any real engine action. Every
// simulated game checks these after every move/card, so a rule change that
// breaks the engine in some rare corner shows up with a reproducible seed.
import { chess, viewFor, opp } from './engine.js'

const KNOWN_TYPES = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'barricade'])

function countPieces(gs) { return Object.keys(gs.pieces).length }

export function checkState(gs, where) {
  const errs = []
  const valid = chess.getValidSquares(gs.board)
  const kings = { white: 0, black: 0 }
  for (const sq in gs.pieces) {
    const p = gs.pieces[sq]
    if (!valid.has(sq)) errs.push(`${where}: piece ${p.color} ${p.type} on non-existent square ${sq}`)
    if (!KNOWN_TYPES.has(p.type)) errs.push(`${where}: unknown piece type ${p.type} on ${sq}`)
    if (!['white', 'black', 'neutral'].includes(p.color)) errs.push(`${where}: bad color ${p.color} on ${sq}`)
    if (!Number.isInteger(p.hp) || p.hp < 1) errs.push(`${where}: bad hp ${p.hp} on ${sq}`)
    if (p.frozen && !(Number.isInteger(p.frozen) && p.frozen > 0)) errs.push(`${where}: bad frozen ${p.frozen} on ${sq}`)
    if (p.unstable && !(p.unstable.turnsLeft > 0)) errs.push(`${where}: unstable with turnsLeft ${p.unstable.turnsLeft} on ${sq}`)
    if (p.type === 'king' && p.unstable) errs.push(`${where}: king made unstable on ${sq}`)
    if (p.type === 'pawn' && p.unstable) errs.push(`${where}: pawn made unstable on ${sq}`)
    if (p.type === 'king') kings[p.color]++
    if (p.type === 'pawn' && !p.unstable) {
      const r = parseInt(sq.slice(1), 10)
      if (r === chess.promotionRank(gs.board, p.color)) errs.push(`${where}: unpromoted ${p.color} pawn parked on its promotion rank ${sq}`)
    }
  }
  if (kings.white > 1 || kings.black > 1) errs.push(`${where}: more than one king per side ${JSON.stringify(kings)}`)
  for (const m of gs.meteors ?? []) if (!(m.turnsLeft > 0)) errs.push(`${where}: meteor with turnsLeft ${m.turnsLeft}`)
  for (const z of gs.fogZones ?? []) {
    if (!(z.turnsLeft > 0)) errs.push(`${where}: fog zone with turnsLeft ${z.turnsLeft}`)
    for (const c of z.cells) if (!valid.has(c)) errs.push(`${where}: fog cell ${c} not on board`)
  }
  const mineSquares = (gs.mines ?? []).map(m => m.square)
  if (new Set(mineSquares).size !== mineSquares.length) errs.push(`${where}: two mines on one square`)
  return errs
}

// The server's redacted view must never contain what it's meant to hide.
export function checkRedaction(gs, where) {
  const errs = []
  for (const viewer of ['white', 'black']) {
    const v = viewFor(gs, viewer)
    const enemy = opp(viewer)
    for (const z of gs.fogZones ?? []) {
      if (z.owner !== enemy) continue
      for (const c of z.cells) if (v.pieces[c]?.color === enemy) errs.push(`${where}: ${viewer} can see ${enemy} piece hidden in fog at ${c}`)
    }
    for (const m of v.meteors ?? []) if (m.owner === enemy && m.square) errs.push(`${where}: ${viewer} sees enemy meteor square ${m.square}`)
    for (const m of v.mines ?? []) if (m.owner === enemy && m.square) errs.push(`${where}: ${viewer} sees enemy mine square ${m.square}`)
    for (const e of v.actionLog ?? []) {
      if (e.color !== enemy || e.kind !== 'card') continue
      if ((e.cardId === 'meteor' || e.cardId === 'freeze') && e.target) errs.push(`${where}: ${viewer}'s battle log reveals enemy ${e.cardId} target ${e.target}`)
    }
  }
  return errs
}

export function checkMove(before, after, color) {
  const errs = []
  if (after.turn === before.turn) errs.push(`move by ${color} did not pass the turn`)
  if (after.cardPlayedThisTurn) errs.push(`cardPlayedThisTurn not reset after a move`)
  const newCaptures = (after.moveHistory?.length ?? 0) - (before.moveHistory?.length ?? 0) - 1
  const captured = (after.moveHistory ?? []).slice(before.moveHistory?.length ?? 0).filter(m => m.captured).length
  const expected = countPieces(before) - captured
  if (countPieces(after) !== expected) errs.push(`piece count ${countPieces(before)} -> ${countPieces(after)} but ${captured} captures logged (+${newCaptures} extra history rows)`)
  return errs
}

export function checkCard(before, after, color, cardId) {
  const errs = []
  if (after.turn !== before.turn) errs.push(`card ${cardId} changed the turn`)
  if (!after.cardPlayedThisTurn) errs.push(`card ${cardId} did not set cardPlayedThisTurn`)
  if (after.cards[color].hand.length !== before.cards[color].hand.length - 1) errs.push(`card ${cardId} did not leave the hand exactly once`)
  return errs
}
