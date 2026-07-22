import { useMemo } from 'react'
import { PIECE_ICONS } from './pieceIcons'
import './MenuLayout.css'

const PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen']
const COLORS = ['white', 'black']
const EDGES  = ['top', 'right', 'bottom', 'left']
const OFF    = -14  // % past the edge — just enough to be fully hidden, no wasted travel

const rand = (min, max) => min + Math.random() * (max - min)
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// A point just off one specific edge, at a random spot along it — e.g.
// 'left' sits at x=-14%, y=random. Both coordinates are plain viewport
// percentages, not a trig-computed offset from some anchor: given a start
// edge and an end edge, the piece's path is exactly and only "off past
// this edge -> off past that edge", so which side it enters/exits from is
// decided directly, not left to chance.
function pointOnEdge(edge) {
  const along = rand(10, 90)
  switch (edge) {
    case 'top':    return { x: along, y: OFF }
    case 'bottom': return { x: along, y: 100 - OFF }
    case 'left':   return { x: OFF, y: along }
    case 'right':  return { x: 100 - OFF, y: along }
    default:       return { x: along, y: OFF }
  }
}

// Regenerated once per app load (see the useMemo below). Each of the 3
// pieces is pre-assigned its OWN start edge (a shuffle of all 4, so with
// only 3 pieces at least 3 different sides are always used — never "all
// from the left" by unlucky chance) and a separate random end edge, so
// every piece's line of travel is a real edge-to-edge crossing decided by
// construction, not by a wide margin hoping trigonometry lands somewhere
// varied.
function generateFloatingPieces(count = 5) {
  const startEdges = shuffled(EDGES)
  return Array.from({ length: count }, (_, i) => {
    const startEdge = startEdges[i % startEdges.length]
    const endEdge   = pick(EDGES.filter(e => e !== startEdge))
    const from = pointOnEdge(startEdge)
    const to   = pointOnEdge(endEdge)
    const spins = rand(1, 2.4) * pick([-1, 1])
    return {
      id: i,
      type: pick(PIECE_TYPES),
      color: pick(COLORS),
      size: rand(34, 50),
      // Static anchor = the FROM point; the flight itself is a composited
      // `transform: translate(...)` by the delta, in vw/vh (the fixed
      // full-viewport .ml-bg makes left/top-% and vw/vh the same scale).
      // It used to animate left/top directly, which forced a full style
      // recalc + layout EVERY FRAME on EVERY SCREEN for the whole app's
      // lifetime (measured: 60 layouts/sec at idle) — the single biggest
      // constant drag on responsiveness. transform costs the main thread
      // nothing once the layer is composited.
      fromX: `${from.x.toFixed(1)}%`,
      fromY: `${from.y.toFixed(1)}%`,
      dx: `${(to.x - from.x).toFixed(1)}vw`,
      dy: `${(to.y - from.y).toFixed(1)}vh`,
      flyDuration: `${rand(26, 30).toFixed(1)}s`,
      // The first piece always starts at delay 0 — with only 3 pieces and
      // otherwise-random delays there was a real chance every single one
      // landed on a multi-second delay, so the screen showed nothing at
      // all for a few seconds right after load. This guarantees motion is
      // visible the instant the app mounts.
      flyDelay: i === 0 ? '0s' : `${rand(0, 5).toFixed(1)}s`,
      spinDuration: `${rand(18, 40).toFixed(1)}s`,
      spinTo: `${(spins * 360).toFixed(0)}deg`,
    }
  })
}

// Persistent felt-table backdrop + slowly flying/rotating piece
// silhouettes — mounted once at the App root (see App.jsx) so it never
// unmounts as the menu/lobby/waiting-room screens swap in and out. Those
// screens used to each paint their own copy of this same gradient +
// texture + vignette + floating decoration, which meant the decoration
// visibly reset (coins snapping back to frame zero) on every navigation.
//
// Position and rotation are two separate animated elements (.ml-piece
// translates in vw/vh units, the nested .ml-piece-spin rotates) so the two
// transforms never have to share one property — and both stay fully
// composited, off the main thread (see the fromX/dx comment above).
export default function MenuLayout({ children }) {
  const pieces = useMemo(() => generateFloatingPieces(), [])

  return (
    <div className="ml-root">
      <div className="ml-bg">
        <div className="ml-texture" />
        {pieces.map(p => (
          <span
            key={p.id}
            className="ml-piece"
            style={{
              left: p.fromX,
              top: p.fromY,
              width: p.size,
              height: p.size,
              animationDuration: p.flyDuration,
              animationDelay: p.flyDelay,
              '--ml-dx': p.dx,
              '--ml-dy': p.dy,
            }}
          >
            <span
              className="ml-piece-spin"
              style={{ animationDuration: p.spinDuration, '--ml-spin-to': p.spinTo }}
            >
              {PIECE_ICONS[p.color][p.type]}
            </span>
          </span>
        ))}
        <div className="ml-vignette" />
      </div>

      {/* Settings — truly global chrome, not any one screen's content, so
         it lives here instead of being duplicated into (and animated along
         with) every menu screen. Decorative for now — no settings system
         exists yet to back the button. Hidden on the game screens (see
         MenuLayout.css) where the in-game header owns the top edge — it
         was colliding with the scoreboard/opponent panel there. The
         version badge that used to sit next to it is gone entirely: it
         fought with in-game HUD for the same corner and patch notes
         already carry the version. */}
      <div className="ml-utility">
        <span className="ml-round-btn" title="Настройки (пока не работает)">⚙</span>
      </div>

      {children}
    </div>
  )
}
