// One complete round, played for real: draft -> placement -> battle, by
// the AI on both sides, through the actual server rules (tryMove /
// tryPlayCard). Returns a compact record with everything the analysis
// needs to explain WHY a game went the way it did.
import { server, viewFor, kingSquare, opp, legalMoves, boards, buildBattle } from './engine.js'
import { decide, searchMoves, STRENGTHS } from './ai/search.js'
import { resolveDraftPolicy, runDraft } from './ai/draftAI.js'
import { runPlacement } from './ai/placementAI.js'
import { DEFAULT_VALUES } from './ai/eval.js'
import { newMemory, perceive, relook } from './ai/perception.js'
import { checkState, checkRedaction, checkMove, checkCard } from './invariants.js'

function material(gs, color) {
  let s = 0
  for (const sq in gs.pieces) { const p = gs.pieces[sq]; if (p.color === color && p.type !== 'king') s += DEFAULT_VALUES[p.type] ?? 0 }
  return s
}

function describeTarget(gs, me, target) {
  const p = gs.pieces[target]
  if (!p) return 'empty'
  if (p.color === 'neutral') return 'barricade'
  return (p.color === me ? 'own-' : 'enemy-') + p.type
}

export function playRound(cfg, rng) {
  const round = cfg.round
  const pattern = cfg.pattern ?? boards.BOARD_PATTERNS[round][Math.floor(rng() * boards.BOARD_PATTERNS[round].length)]
  const ds = runDraft(round, { white: resolveDraftPolicy(cfg.draft.white), black: resolveDraftPolicy(cfg.draft.black) }, rng, 'white', pattern)
  const armies = { white: ds.picks.white.pieces, black: ds.picks.black.pieces }
  const maps = runPlacement(pattern, armies, cfg.placement?.styles ?? { white: 'king-back', black: 'king-back' }, rng, cfg.placement ?? {})
  let gs = buildBattle(pattern, maps, { white: ds.picks.white.cards, black: ds.picks.black.cards })
  const strengths = { white: STRENGTHS[cfg.ai?.white ?? 'normal'], black: STRENGTHS[cfg.ai?.black ?? 'normal'] }
  const mem = { white: newMemory(), black: newMemory() }
  const ev = []
  const violations = []
  const timeline = []
  const moves = [] // compact action list, for replaying/inspecting a game
  const st = { fogBumps: 0, cardRejects: 0, bounces: 0, mineHits: 0, promotions: 0, nodes: 0 }
  let result = null
  let ply = 0
  const maxPlies = cfg.maxPlies ?? 300
  const check = cfg.checkInvariants !== false
  if (check) violations.push(...checkState(gs, 'start'))

  for (; ply < maxPlies && !result; ply++) {
    const me = gs.turn
    if (ply % 10 === 0) timeline.push(material(gs, 'white') - material(gs, 'black'))
    const { view, ghosts } = perceive(gs, me, mem[me])

    const d = decide(view, me, mem[me], strengths[me], rng)
    st.nodes += d.nodes
    if (d.card) moves.push(`${me[0]}:${d.card.cardId}@${d.card.target}`)
    if (d.card) {
      const before = gs
      let r
      try { r = server.tryPlayCard(gs, me, d.card.cardId, d.card.target) } catch (e) { violations.push(`ply ${ply}: tryPlayCard threw ${e.message}`); r = { error: 'threw' } }
      if (r.error) st.cardRejects++
      else {
        gs = r.gameState
        ev.push({ t: 'card', ply, by: me, card: d.card.cardId, on: describeTarget(before, me, d.card.target), why: d.card.why ?? 'перебор' })
        if (check) violations.push(...checkCard(before, gs, me, d.card.cardId).map(e => `ply ${ply}: ${e}`), ...checkState(gs, `ply ${ply} after ${d.card.cardId}`), ...checkRedaction(gs, `ply ${ply}`))
        if (r.result) { result = r.result; break }
      }
    }
    if (!d.moves) {
      // The card has now REALLY been played (its real roll, if any) — plan
      // the move on that board, not on the one imagined while deciding.
      const after = relook(gs, me, ghosts)
      const res = searchMoves(after, me, mem[me], strengths[me], rng)
      st.nodes += res.nodes
      d.moves = res.moves
    }
    let moved = false
    for (const mv of d.moves) {
      const before = gs
      let r
      try { r = server.tryMove(gs, me, mv.from, mv.to, 'queen', 0) } catch (e) { violations.push(`ply ${ply}: tryMove threw ${e.message}`); continue }
      if (r.error) { st.fogBumps++; continue }
      const attacker = before.pieces[mv.from], victim = before.pieces[mv.to]
      if (r.lastAction.type === 'capture') ev.push({ t: 'cap', ply, by: me, a: attacker.type, v: victim.type, vc: victim.color })
      if (r.lastAction.type === 'bounce') { st.bounces++; ev.push({ t: 'bounce', ply, by: me, a: attacker.type, v: victim.type }) }
      if (r.mineStrike) { st.mineHits++; ev.push({ t: 'mine', ply, v: r.gameState.pieces[r.mineStrike.square]?.type }) }
      for (const s of r.meteorStrikes ?? []) {
        const hit = before.pieces[s.square]
        ev.push({ t: 'meteor', ply, owner: s.owner, v: hit?.type ?? null, vc: hit?.color ?? null, kill: !!s.destroyed })
      }
      if (attacker.type === 'pawn' && r.gameState.pieces[mv.to]?.type !== 'pawn' && r.lastAction.type !== 'bounce') st.promotions++
      moves.push(`${me[0]}:${mv.from}${mv.to}`)
      gs = r.gameState
      if (check) violations.push(...checkMove(before, gs, me).map(e => `ply ${ply}: ${e}`), ...checkState(gs, `ply ${ply}`), ...checkRedaction(gs, `ply ${ply}`))
      result = r.result
      moved = true
      break
    }
    if (!moved) {
      // Nothing the AI saw was actually playable on the real board.
      const real = legalMoves(gs, me)
      result = { type: real.length ? 'ai_stuck' : 'no_moves_unresolved', winner: opp(me) }
      if (real.length) violations.push(`ply ${ply}: AI found no playable move but ${real.length} exist (fog?)`)
      break
    }
  }
  if (!result) result = { type: 'cap' }

  // What took the king?
  let kingKiller = null
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i]
    if (e.t === 'cap' && e.v === 'king') { kingKiller = e.a; break }
    if (e.t === 'meteor' && e.v === 'king' && e.kill) { kingKiller = 'meteor'; break }
  }
  const firstCap = ev.find(e => e.t === 'cap')
  return {
    round, board: pattern.name, draft: cfg.draft, placement: cfg.placement?.styles ?? null, ai: cfg.ai ?? null,
    result: result.type, reason: result.reason ?? null, winner: result.winner ?? null, plies: ply,
    armies: { white: { pieces: ds.picks.white.pieces, cards: ds.picks.white.cards }, black: { pieces: ds.picks.black.pieces, cards: ds.picks.black.cards } },
    left: { white: ds.budgets.white, black: ds.budgets.black },
    kingKiller, firstCapturePly: firstCap ? firstCap.ply : null,
    events: ev, timeline, moves, stats: st, violations,
    placements: maps,
  }
}
