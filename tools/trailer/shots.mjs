// Staged battle moments for the trailer, played in the dev sandbox (real
// rules — every move must be legal). a1 = white's corner; white moves first.
const OPEN6 = { rows: 6, cols: 6, blockedCells: [] }
const LETTER = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' }
// 'Ke1 Qc1' → { e1: { type: 'king', color, hp: 1 }, c1: ... }
function army(color, spec) {
  const out = {}
  for (const tok of spec.split(/\s+/).filter(Boolean)) out[tok.slice(1)] = { type: LETTER[tok[0]], color, hp: 1 }
  return out
}
const pos = (white, black, cards = {}) => ({
  board: OPEN6,
  white: army('white', white),
  black: army('black', black),
  cards: { white: cards.white ?? ['meteor', 'shield', 'freeze'], black: cards.black ?? ['smoke_screen', 'barricade'] },
})

export const SANDBOX_SHOTS = {
  // Meteor called on the black queen; two quiet turns later — impact.
  meteor: {
    position: pos('Ke1 Qc1 Nb1 Pa2 Pb2 Pe2', 'Kf6 Qd4 Ra6 Pe5 Pf5'),
    async play(a) {
      await a.card('meteor', 'd4', 1000)
      await a.move('b2', 'b3', 700)
      await a.move('a6', 'a5', 700)
      await a.move('a2', 'a3', 700)
      await a.move('f5', 'f4', 2400) // 2nd black move → impact
    },
    tail: 1200,
  },

  // Shielded rook: the queen takes it, bounces off — and gets eaten back.
  shield: {
    position: pos('Kb1 Rd2 Pa2 Pb2 Pe2 Bf1', 'Kf6 Qd6 Rb6 Pe5 Pf5', { white: ['shield', 'meteor', 'freeze'] }),
    async play(a) {
      await a.card('shield', 'd2', 1000)
      await a.move('a2', 'a3', 700)
      await a.move('d6', 'd2', 1500) // bounces off the shield
      await a.move('d2', 'd6', 1500) // rook takes the queen
    },
    tail: 1000,
  },

  // Invisible freeze mine: the queen steps on it, gets stuck, gets taken.
  freeze: {
    position: pos('Kb1 Bc2 Pa2 Pb2 Nf1', 'Kf6 Qd5 Ra6 Pe6 Pf5', { white: ['freeze', 'meteor', 'shield'] }),
    async play(a) {
      await a.card('freeze', 'e4', 1000)
      await a.move('a2', 'a3', 700)
      await a.move('d5', 'e4', 1500) // steps on the mine → frozen
      await a.move('c2', 'e4', 1500) // bishop takes the frozen queen
    },
    tail: 1000,
  },

  // Smoke screen: the white army vanishes from black's view.
  smoke: {
    position: pos('Kb1 Nc1 Pa2 Pb2 Qc2 Pe2', 'Ke6 Qd5 Ra6 Pe5 Pf5', { white: ['smoke_screen', 'meteor', 'shield'] }),
    async play(a) {
      await a.card('smoke_screen', 'b2', 1000)
      await a.move('e2', 'e3', 1600) // black's turn: the corner is just smoke
      await a.move('d5', 'd4', 1200)
    },
    tail: 900,
  },

  // Stone wall: the rook smashes into it — and it holds.
  stone: {
    position: pos('Kd1 Pa2 Pb2 Nf1 Pe2', 'Kf6 Rd6 Pe5 Pf5 Qa6', { white: ['barricade', 'meteor', 'shield'] }),
    async play(a) {
      await a.card('barricade', 'd3', 1000)
      await a.move('a2', 'a3', 700)
      await a.move('d6', 'd3', 1500) // hits the stone: 2 HP → 1, rook bounces
      await a.move('b2', 'b3', 900)
    },
    tail: 900,
  },

  // Unstable: the enemy queen starts shape-shifting.
  unstable: {
    position: pos('Ke1 Qc1 Pa2 Pb2 Nb1', 'Kf6 Qd4 Ra6 Pe5 Pf5', { white: ['unstable', 'meteor', 'shield'] }),
    async play(a) {
      await a.card('unstable', 'd4', 1000)
      await a.move('a2', 'a3', 800)
      await a.move('a6', 'a5', 800)
      await a.move('b2', 'b3', 800)
      await a.move('a5', 'a4', 1300)
    },
    tail: 900,
  },
}
