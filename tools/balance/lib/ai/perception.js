// What the AI "sees" each turn, beyond the server's redacted view — the
// memory a person keeps. Shared by the balance lab (game.js) and the
// in-game bot (server/bot.js) so both play with the same eyes.
import { viewFor, opp } from '../engine.js'
import { likeliestMeteorTarget } from './eval.js'

export function newMemory() {
  return { known: {}, seenMeteors: 0, lastMeteorAim: null }
}

// The redacted view for `me`, plus:
//  · ghosts — enemy pieces last seen going into an enemy fog zone are
//    assumed to still be there (a person keeps track; without it the AI
//    was blind to smoke);
//  · meteor aim — when an unseen enemy meteor appears, remember which of
//    our pieces it's most likely aimed at.
// Returns { view, ghosts }. `mem` is updated in place.
export function perceive(gs, me, mem) {
  let view = viewFor(gs, me)
  const enemyFog = new Set((gs.fogZones ?? []).filter(z => z.owner !== me).flatMap(z => z.cells))
  const ghosts = {}
  for (const [sq, p] of Object.entries(mem.known ?? {})) {
    if (enemyFog.has(sq) && !view.pieces[sq]) ghosts[sq] = p
  }
  const known = { ...ghosts }
  for (const sq in view.pieces) if (view.pieces[sq].color === opp(me)) known[sq] = view.pieces[sq]
  mem.known = known
  if (Object.keys(ghosts).length) view = { ...view, pieces: { ...view.pieces, ...ghosts } }
  const hiddenNow = (view.meteors ?? []).filter(m => m.hidden).length
  if (hiddenNow > mem.seenMeteors) mem.lastMeteorAim = likeliestMeteorTarget(view, me)
  mem.seenMeteors = hiddenNow
  return { view, ghosts }
}

// Re-look after something changed mid-turn (a card really played), keeping
// ghosts that are still unexplained.
export function relook(gs, me, ghosts) {
  let view = viewFor(gs, me)
  const keep = Object.fromEntries(Object.entries(ghosts).filter(([sq]) => !view.pieces[sq]))
  if (Object.keys(keep).length) view = { ...view, pieces: { ...view.pieces, ...keep } }
  return view
}
