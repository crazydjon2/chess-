import { squareName, cellXY } from '../game/coords'
import { getRenderer } from './pieces/registry'
import './VisualLayer.css'

const LIGHT = '#f0d9b5'
const DARK  = '#b58863'

const BRACKET_COLOR = 'rgba(230,200,100,0.95)'
const MOVE_COLOR    = 'rgba(46,204,113,0.85)'  // green — plain move, unambiguous
const CAPTURE_COLOR = 'rgba(231,76,60,0.92)'   // red — capture, unambiguous
const CARD_STROKE   = 'rgba(200,160,255,0.75)'
const CARD_FILL     = 'rgba(130,60,220,0.10)'

function squareDark(col, rank) { return (rank + col) % 2 === 1 }

// Corner bracket selection indicator
function brackets(key, x, y, S, color, w = 2.5) {
  const a = S * 0.20
  const h = w / 2
  return [
    <path key={`${key}0`} d={`M${x+h},${y+a} V${y+h} H${x+a}`}           fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />,
    <path key={`${key}1`} d={`M${x+S-a},${y+h} H${x+S-h} V${y+a}`}       fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />,
    <path key={`${key}2`} d={`M${x+h},${y+S-a} V${y+S-h} H${x+a}`}       fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />,
    <path key={`${key}3`} d={`M${x+S-a},${y+S-h} H${x+S-h} V${y+S-a}`}   fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />,
  ]
}

// Full-square outline — used for move/capture targets (red = capture, green = move)
function frame(key, x, y, S, color, w = 3) {
  const inset = w / 2 + 1
  return (
    <rect key={key} x={x + inset} y={y + inset} width={S - inset * 2} height={S - inset * 2}
      fill="none" stroke={color} strokeWidth={w} rx={3} />
  )
}

export default function VisualLayer({ gameState, highlights, skin, width, height, cellSize, lastMoveAnim, meteorStrikeAnim, flipped = false }) {
  const { rows, cols } = gameState.board.size
  const { Component: PieceComponent, Defs } = getRenderer(skin)

  const targetSet      = new Set(highlights.targets)
  const cardTargetSet  = new Set(highlights.cardTargets)
  const extraCells     = gameState.board.extraCells ?? []
  const blockedSet     = new Set(gameState.board.blockedCells ?? [])

  const at = (col, rank) => cellXY(col, rank, rows, cols, cellSize, flipped)

  const squares        = []
  const overlays       = []
  const moveIndicators = []

  // ── Main board squares ──────────────────────────────────────────
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const rank   = rows - row
      const square = squareName(row, col, rows)
      const { x, y } = at(col, rank)

      squares.push(
        <rect key={square} x={x} y={y} width={cellSize} height={cellSize}
          fill={squareDark(col, rank) ? DARK : LIGHT} />
      )

      // Static map obstacle (board pattern) — excluded from getValidSquares
      // UNLESS add_cell has reopened this exact hole (extraCells overrides
      // blockedCells there, see chess.js's getValidSquares) — once reopened
      // it's just a normal square again, so skip the X overlay/early-out.
      if (blockedSet.has(square) && !extraCells.includes(square)) {
        const m = cellSize * 0.22
        overlays.push(
          <rect key={`bl-${square}`} x={x} y={y} width={cellSize} height={cellSize} fill="rgba(0,0,0,0.62)" />,
          <line key={`blx1-${square}`} x1={x+m} y1={y+m} x2={x+cellSize-m} y2={y+cellSize-m}
            stroke="rgba(180,50,35,0.80)" strokeWidth={3.5} strokeLinecap="round" />,
          <line key={`blx2-${square}`} x1={x+cellSize-m} y1={y+m} x2={x+m} y2={y+cellSize-m}
            stroke="rgba(180,50,35,0.80)" strokeWidth={3.5} strokeLinecap="round" />
        )
        continue
      }

      if (square === highlights.checkSquare) {
        overlays.push(
          <rect key={`check-${square}`} className="sq-check" x={x} y={y}
            width={cellSize} height={cellSize} fill="rgba(210,30,30,0.70)" />
        )
      }

      // Corner brackets for selected / drag-from
      if (square === highlights.selected) {
        overlays.push(...brackets(`sel-${square}`, x, y, cellSize, BRACKET_COLOR, 2.8))
      } else if (square === highlights.dragFrom) {
        overlays.push(...brackets(`df-${square}`, x, y, cellSize, `rgba(230,200,100,0.55)`, 2.2))
      }

      // Drag-over: subtle tint
      if (square === highlights.dragOver) {
        overlays.push(
          <rect key={`do-${square}`} x={x} y={y} width={cellSize} height={cellSize}
            fill="rgba(90,150,220,0.20)" />
        )
      }

      // Card target: dashed rect outline
      if (cardTargetSet.has(square)) {
        overlays.push(
          <rect key={`ct-${square}`} x={x+2} y={y+2}
            width={cellSize-4} height={cellSize-4}
            fill={CARD_FILL} stroke={CARD_STROKE}
            strokeWidth={1.8} strokeDasharray="5,3" rx={2} />
        )
      }

      // Move indicators — full square outline, red for a capture, green for a plain move
      if (targetSet.has(square)) {
        const isCapture = !!gameState.pieces[square]
        moveIndicators.push(frame(`mv-${square}`, x, y, cellSize, isCapture ? CAPTURE_COLOR : MOVE_COLOR))
      }
    }
  }

  // ── Extra cells ─────────────────────────────────────────────────
  const extraElements = []
  extraCells.forEach(sq => {
    const col  = sq.charCodeAt(0) - 97
    const rank = parseInt(sq.slice(1))
    const { x, y } = at(col, rank)

    extraElements.push(
      <rect key={`ex-${sq}`} x={x} y={y} width={cellSize} height={cellSize}
        fill={squareDark(col, rank) ? DARK : LIGHT} />
    )
    if (sq === highlights.selected) {
      extraElements.push(...brackets(`sel-ex-${sq}`, x, y, cellSize, BRACKET_COLOR, 2.8))
    } else if (sq === highlights.dragFrom) {
      extraElements.push(...brackets(`df-ex-${sq}`, x, y, cellSize, `rgba(230,200,100,0.55)`, 2.2))
    }
    if (sq === highlights.dragOver) {
      extraElements.push(
        <rect key={`do-ex-${sq}`} x={x} y={y} width={cellSize} height={cellSize}
          fill="rgba(90,150,220,0.20)" />
      )
    }
    if (cardTargetSet.has(sq)) {
      extraElements.push(
        <rect key={`ct-ex-${sq}`} x={x+2} y={y+2} width={cellSize-4} height={cellSize-4}
          fill={CARD_FILL} stroke={CARD_STROKE} strokeWidth={1.8} strokeDasharray="5,3" rx={2} />
      )
    }
    if (targetSet.has(sq)) {
      const isCapture = !!gameState.pieces[sq]
      extraElements.push(frame(`mv-ex-${sq}`, x, y, cellSize, isCapture ? CAPTURE_COLOR : MOVE_COLOR))
    }
  })

  // ── Card border ghost squares (add_cell targets not yet on board) ─
  const borderElements = []
  highlights.cardTargets.forEach(sq => {
    const col  = sq.charCodeAt(0) - 97
    const rank = parseInt(sq.slice(1))
    const inRect  = rank >= 1 && rank <= rows && col >= 0 && col < cols
    const inExtra = extraCells.includes(sq)
    if (inRect || inExtra) return

    const { x, y } = at(col, rank)
    const pad = 4
    borderElements.push(
      <rect key={`ghost-${sq}`} x={x+pad} y={y+pad}
        width={cellSize-pad*2} height={cellSize-pad*2}
        fill="rgba(40,180,80,0.09)" stroke="rgba(60,200,100,0.60)"
        strokeWidth={1.8} strokeDasharray="5,3" rx={4} />,
      <text key={`ghost-lbl-${sq}`}
        x={x+cellSize/2} y={y+cellSize/2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={cellSize*0.30} fill="rgba(80,220,120,0.75)"
        style={{ pointerEvents:'none', userSelect:'none' }}>+</text>
    )
  })

  // ── Frozen overlays ─────────────────────────────────────────────
  const frozenOverlays = []
  Object.entries(gameState.pieces).forEach(([square, piece]) => {
    if (!piece.frozen) return
    const col  = square.charCodeAt(0) - 97
    const rank = parseInt(square.slice(1), 10)
    const { x, y } = at(col, rank)
    frozenOverlays.push(
      <rect key={`fr-${square}`} x={x} y={y} width={cellSize} height={cellSize}
        fill="rgba(72,196,240,0.15)" />,
      <text key={`fr-lbl-${square}`}
        x={x + cellSize * 0.82} y={y + cellSize * 0.20}
        fontSize={cellSize * 0.28} fill="rgba(100,220,255,0.90)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}>❄</text>
    )
  })

  // ── Smoke-screen fog zones ───────────────────────────────────────
  // The cloud itself is visible to both players — only the pieces inside
  // it are actually hidden, and that's already done server-side before this
  // component ever sees them (redacted out of gameState.pieces). Made
  // deliberately unmissable: a dense, pulsing tint with a cloud glyph on
  // every cell plus a turns-remaining badge, not a faint tint easy to miss.
  const fogOverlays = []
  ;(gameState.fogZones ?? []).forEach((zone, zi) => {
    zone.cells.forEach(sq => {
      const col  = sq.charCodeAt(0) - 97
      const rank = parseInt(sq.slice(1), 10)
      const { x, y } = at(col, rank)
      fogOverlays.push(
        <rect key={`fog-${zi}-${sq}`} className="fog-cell" x={x} y={y} width={cellSize} height={cellSize}
          fill="rgba(120,135,145,0.55)" stroke="rgba(225,230,235,0.65)" strokeWidth={1.5} strokeDasharray="5,3" />,
        <text key={`fog-ic-${zi}-${sq}`}
          x={x + cellSize / 2} y={y + cellSize / 2}
          textAnchor="middle" dominantBaseline="central"
          fontSize={cellSize * 0.46} fill="rgba(245,248,250,0.65)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>☁</text>
      )
    })

    const badgeSq = zone.cells[Math.floor(zone.cells.length / 2)]
    if (badgeSq) {
      const col  = badgeSq.charCodeAt(0) - 97
      const rank = parseInt(badgeSq.slice(1), 10)
      const { x, y } = at(col, rank)
      const bx = x + cellSize * 0.5
      const by = y + cellSize * 0.5
      fogOverlays.push(
        <g key={`fog-badge-${zi}`}>
          <circle cx={bx} cy={by} r={cellSize * 0.24}
            fill="rgba(15,15,20,0.85)" stroke="rgba(230,230,235,0.75)" strokeWidth={1.5} />
          <text x={bx} y={by + 1} textAnchor="middle" dominantBaseline="central"
            fontSize={cellSize * 0.26} fontWeight="bold" fill="#fff"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{zone.turnsLeft}</text>
        </g>
      )
    }
  })

  // ── Meteor strikes ────────────────────────────────────────────────
  // Only ever the caster's own — the opponent's incoming meteors are
  // redacted server-side to {owner, turnsLeft, hidden:true} with no square
  // at all (see rooms.js's redactMeteors), so there's nothing to draw for
  // those here; they surface as a location-less warning elsewhere in the
  // UI instead. A hard blink (see meteor-blink in VisualLayer.css) rather
  // than fog's slow pulse — this needs to read as urgent, not ambient —
  // and a corner glyph/badge instead of a center-filling one, so whatever
  // piece is actually on the square (if any) stays fully visible.
  const meteorOverlays = []
  ;(gameState.meteors ?? []).forEach((m, mi) => {
    if (!m.square) return
    const col  = m.square.charCodeAt(0) - 97
    const rank = parseInt(m.square.slice(1), 10)
    const { x, y } = at(col, rank)
    meteorOverlays.push(
      <rect key={`met-${mi}`} className="meteor-cell" x={x + 2} y={y + 2}
        width={cellSize - 4} height={cellSize - 4}
        fill="none" stroke="rgba(255,140,60,0.95)" strokeWidth={3} rx={2} />,
      <text key={`met-ic-${mi}`}
        x={x + cellSize * 0.18} y={y + cellSize * 0.20}
        textAnchor="middle" dominantBaseline="central"
        fontSize={cellSize * 0.28} fill="rgba(255,160,80,0.95)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}>☄</text>,
      <g key={`met-badge-${mi}`}>
        <circle cx={x + cellSize * 0.82} cy={y + cellSize * 0.82} r={cellSize * 0.16}
          fill="rgba(15,15,20,0.9)" stroke="rgba(255,160,80,0.95)" strokeWidth={1.5} />
        <text x={x + cellSize * 0.82} y={y + cellSize * 0.82 + 1} textAnchor="middle" dominantBaseline="central"
          fontSize={cellSize * 0.20} fontWeight="bold" fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>{m.turnsLeft}</text>
      </g>
    )
  })

  // ── Meteor impact (the moment it lands) ──────────────────────────
  // Unlike the pending-strike overlay above (caster-only), this is driven
  // by meteorStrikeAnim — a transient, un-redacted event both players get
  // identically the instant a meteor detonates (see rooms.js's
  // broadcastMatch), so both actually see the same explosion at the same
  // square, regardless of who cast it. Keyed by ts so a repeat strike on
  // the same square still retriggers the animation via remount.
  const meteorImpacts = []
  ;(meteorStrikeAnim?.strikes ?? []).forEach((s, si) => {
    const col  = s.square.charCodeAt(0) - 97
    const rank = parseInt(s.square.slice(1), 10)
    const { x, y } = at(col, rank)
    const cx = x + cellSize / 2
    const cy = y + cellSize / 2
    meteorImpacts.push(
      <g key={`impact-${meteorStrikeAnim.ts}-${si}`} className="meteor-impact">
        <circle className="meteor-impact-ring" cx={cx} cy={cy} r={cellSize * 0.1}
          fill="none" stroke="rgba(255,150,50,0.9)" strokeWidth={4} />
        <text className="meteor-impact-glyph" x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={cellSize * 0.6} style={{ pointerEvents: 'none', userSelect: 'none' }}>💥</text>
      </g>
    )
  })

  // ── Footprints + pieces ─────────────────────────────────────────
  const footprints = []
  const pieces     = []

  const movedTo   = lastMoveAnim?.to
  const movedFrom = lastMoveAnim?.from
  const moveType  = lastMoveAnim?.type
  const moveTs    = lastMoveAnim?.ts

  Object.entries(gameState.pieces).forEach(([square, piece]) => {
    const col  = square.charCodeAt(0) - 97
    const rank = parseInt(square.slice(1), 10)
    const { x: px, y: py } = at(col, rank)

    footprints.push(
      <ellipse key={`fp-${square}`}
        cx={px + cellSize/2} cy={py + cellSize*0.88}
        rx={cellSize*0.24} ry={cellSize*0.058}
        fill="rgba(0,0,0,0.20)" />
    )

    let animClass = ''
    let animStyle = {}
    let animKey   = square

    if (moveType === 'move' && square === movedTo) {
      const fc = movedFrom.charCodeAt(0) - 97
      const fr = parseInt(movedFrom.slice(1))
      const { x: fx, y: fy } = at(fc, fr)
      animClass = 'piece-moving'
      animStyle = { '--from-dx': `${fx - px}px`, '--from-dy': `${fy - py}px` }
      animKey   = `${square}-${moveTs}`
    } else if (moveType === 'capture' && square === movedTo) {
      const fc = movedFrom.charCodeAt(0) - 97
      const fr = parseInt(movedFrom.slice(1))
      const { x: fx, y: fy } = at(fc, fr)
      animClass = 'piece-capturing'
      animStyle = { '--from-dx': `${fx - px}px`, '--from-dy': `${fy - py}px` }
      animKey   = `${square}-${moveTs}`
    } else if (moveType === 'bounce' && square === movedFrom) {
      const tc = movedTo.charCodeAt(0) - 97
      const tr = parseInt(movedTo.slice(1))
      const { x: tx, y: ty } = at(tc, tr)
      animClass = 'piece-bouncing'
      animStyle = { '--to-dx': `${tx - px}px`, '--to-dy': `${ty - py}px` }
      animKey   = `${square}-${moveTs}`
    }

    const isSelected   = !animClass && square === highlights.selected
    const isDragSource = !animClass && square === highlights.dragFrom

    pieces.push(
      <g key={animKey}
        className={
          'piece-g' +
          (animClass     ? ` ${animClass}`  : '') +
          (isSelected    ? ' piece-lifted'  : '') +
          (isDragSource  ? ' piece-drag'    : '')
        }
        style={animStyle}
      >
        <PieceComponent piece={piece} x={px} y={py} size={cellSize} />
      </g>
    )
  })

  return (
    <svg
      className="visual-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position:'absolute', top:0, left:0, pointerEvents:'none', overflow:'visible' }}
    >
      <defs><Defs /></defs>
      {squares}
      {extraElements}
      {overlays}
      {moveIndicators}
      {borderElements}
      {fogOverlays}
      {footprints}
      {pieces}
      {frozenOverlays}
      {meteorOverlays}
      {meteorImpacts}
    </svg>
  )
}
