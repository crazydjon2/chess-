// The board as it's drawn — tilted table, flat squares, upright pieces.
// Purely presentational + raw input: it knows nothing about chess rules,
// recruit or cards. Controllers (BattleBoard, the recruit screen) pass
// pieces + highlight lists and get square clicks / drags back.
//
// Structure (all inside one 3D-tilted frame, see board.css):
//   .bd-svg     — squares + every FLAT effect (highlights, fog, mines…)
//   .bd-cell    — invisible hit squares (click / drop targets)
//   .bd-piece   — one per piece, positioned in the board plane; its inner
//                 .bd-stand counter-rotates by the tilt so the art stands up
//                 (and is itself clickable — you click what you see).
// Piece art comes from the active skin (skins/Piece.jsx); the board only
// sizes and positions it, so any skin works without touching this file.
import { useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { squareName, cellXY } from '../../game/coords'
import { Piece, usePieceScale } from '../../skins/Piece'
import './board.css'

const U = 100 // svg units per cell
const FRAME_PAD = 12
const COORD = 22
const DRAG_THRESHOLD = 6

const colOf = sq => sq.charCodeAt(0) - 97
const rankOf = sq => parseInt(sq.slice(1), 10)
const isDark = (col, rank) => (rank + col) % 2 === 1

function readTilt(el) {
  const raw = getComputedStyle(el).getPropertyValue('--board-tilt').trim()
  const deg = parseFloat(raw)
  return Number.isFinite(deg) ? deg : 0
}

function readVar(el, name, fallback) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name))
  return Number.isFinite(v) ? v : fallback
}

// Where the tilted frame actually lands on screen — computed exactly, the
// same way the browser does it for .bd-frame.tilted:
//   transform: perspective(P) rotateX(tilt) scale(s); origin 50% 62%
// with P = 2.4·W. Returns the projected width/height and how far the
// projected centre sits below the flat box's centre. Exact maths instead of
// measuring the drawn element: a measurement taken at the wrong moment (an
// entrance animation, fonts still loading) left the board oversized until
// the next resize.
export function projectFrame(W, H, tiltDeg, scale) {
  if (!tiltDeg) return { w: W * scale, h: H * scale, cy: 0 }
  const a = (tiltDeg * Math.PI) / 180
  const P = W * 2.4
  const oy = H * 0.62
  const proj = (x, y) => {
    const ys = y * scale, xs = x * scale
    const z = ys * Math.sin(a)
    const k = P / (P - z)
    return [xs * k, ys * Math.cos(a) * k]
  }
  const top = proj(W / 2, -oy)
  const bot = proj(W / 2, H - oy)
  const w = 2 * Math.max(Math.abs(top[0]), Math.abs(bot[0]))
  const h = bot[1] - top[1]
  const cy = oy + (top[1] + bot[1]) / 2 - H / 2
  return { w, h, cy }
}

// Largest cell size whose (projected) framed board fits the scene, centred.
function useBoardFit(cols, rows) {
  const ref = useRef(null)
  const frameRef = useRef(null)
  const [fit, setFit] = useState({ cell: 0, tilt: 0, dx: 0, dy: 0 })
  const compute = useCallback(() => {
    const el = ref.current
    if (!el) return
    const w = el.clientWidth * 0.97
    const h = el.clientHeight * 0.97
    if (!w || !h) return
    const tilt = readTilt(el)
    const scale = readVar(el, '--board-scale', 1)
    const pad = FRAME_PAD * 2 + COORD
    // projected size is ~proportional to the flat size: two refinements settle it
    let cell = Math.min((w - pad) / cols, (h - pad) / rows)
    for (let i = 0; i < 3; i++) {
      const W = cols * cell + pad, H = rows * cell + pad
      const p = projectFrame(W, H, tilt, scale)
      cell = Math.min((w * W / p.w - pad) / cols, (h * H / p.h - pad) / rows)
    }
    cell = Math.max(8, Math.floor(cell))
    const p = projectFrame(cols * cell + pad, rows * cell + pad, tilt, scale)
    const dy = Math.round(-p.cy)
    setFit(prev => (prev.cell === cell && prev.tilt === tilt && prev.dy === dy ? prev : { cell, tilt, dx: 0, dy }))
  }, [cols, rows])
  useLayoutEffect(() => {
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [compute])
  return [ref, frameRef, fit]
}

// One flat highlight rect per (square, kind).
const HL_CLASS = {
  home: 'hl-home', move: 'hl-move', capture: 'hl-capture', card: 'hl-card',
  premove: 'hl-premove', last: 'hl-last', check: 'hl-check', drop: 'hl-drop',
}

export default function BoardView({
  rows, cols, blockedCells = [], extraCells = [], pieces = {}, flipped = false,
  highlights = [],          // [{ square, kind }] — see HL_CLASS
  selected = null,          // square with the gold outline
  outlines = [],            // [{ square, kind: 'premove'|'target' }]
  ghost = null,             // { square, type, color } — translucent preview piece
  liftSquare = null,        // piece drawn raised (selected)
  hideSquare = null,        // piece hidden (being dragged)
  borderTargets = [],       // squares outside the rectangle that need hit cells
  fogZones = [], meteors = [], mines = [],
  lastMoveAnim = null, meteorStrikeAnim = null, mineStrikeAnim = null,
  interactive = true,
  canDrag,                  // (square) => bool
  onSquareClick, onDragStart, onDragOver, onDrop, onDragCancel,
  testAttrs = {},
  children,                 // extra overlays rendered inside the scene (popovers anchor to cells)
}) {
  const [sceneRef, frameRef, fit] = useBoardFit(cols, rows)
  const pieceScale = usePieceScale()
  const cell = fit.cell
  const W = cols * U
  const H = rows * U
  const at = (col, rank) => cellXY(col, rank, rows, cols, 1, flipped)
  const atSq = sq => at(colOf(sq), rankOf(sq))

  const blocked = new Set(blockedCells)
  const extra = new Set(extraCells)

  // ── Squares ───────────────────────────────────────────────────────
  const squares = []
  const voids = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const rank = rows - row
      const sq = squareName(row, col, rows)
      const { x, y } = at(col, rank)
      if (blocked.has(sq) && !extra.has(sq)) {
        voids.push(<rect key={sq} x={x * U} y={y * U} width={U} height={U} className="sq-void" />)
        continue
      }
      squares.push(<SquareRect key={sq} x={x * U} y={y * U} dark={isDark(col, rank)} />)
    }
  }
  extraCells.forEach(sq => {
    const { x, y } = atSq(sq)
    const inRect = rankOf(sq) >= 1 && rankOf(sq) <= rows && colOf(sq) >= 0 && colOf(sq) < cols
    if (inRect && !blocked.has(sq)) return
    squares.push(<SquareRect key={`ex-${sq}`} x={x * U} y={y * U} dark={isDark(colOf(sq), rankOf(sq))} />)
  })

  // ── Flat highlights ───────────────────────────────────────────────
  const hl = highlights.map(({ square, kind }, i) => {
    const { x, y } = atSq(square)
    return <rect key={`hl-${kind}-${square}-${i}`} x={x * U} y={y * U} width={U} height={U} className={HL_CLASS[kind] ?? 'hl-move'} />
  })
  const ghostTargets = borderTargets
    .filter(sq => !extra.has(sq))
    .map(sq => {
      const { x, y } = atSq(sq)
      return (
        <g key={`gh-${sq}`} className="sq-ghost">
          <rect x={x * U + 6} y={y * U + 6} width={U - 12} height={U - 12} rx={10} />
          <text x={x * U + U / 2} y={y * U + U / 2}>+</text>
        </g>
      )
    })
  const outlineEls = [
    ...(selected ? [{ square: selected, kind: 'select' }] : []),
    ...outlines,
  ].map(({ square, kind }) => {
    const { x, y } = atSq(square)
    return <rect key={`ol-${kind}-${square}`} x={x * U + 3} y={y * U + 3} width={U - 6} height={U - 6} rx={4} className={`ol-${kind}`} />
  })

  // ── Fog / meteors / mines / frozen / unstable (flat on the table) ──
  const fog = []
  fogZones.forEach((zone, zi) => {
    zone.cells.forEach((sq, ci) => {
      const { x, y } = atSq(sq)
      const jx = ((ci * 37) % 11) - 5
      const jy = ((ci * 53) % 9) - 4
      fog.push(<circle key={`fog-${zi}-${sq}`} className="fog-puff" cx={x * U + U / 2 + jx} cy={y * U + U / 2 + jy} r={U * 0.56} />)
    })
  })
  const fogBadges = fogZones.map((zone, zi) => {
    const mid = zone.cells[Math.floor(zone.cells.length / 2)]
    if (!mid) return null
    const { x, y } = atSq(mid)
    return (
      <g key={`fogb-${zi}`} className="fog-badge" transform={`translate(${x * U + U / 2} ${y * U + U * 0.2})`}>
        <rect x={-24} y={-13} width={48} height={26} rx={7} />
        <path d="M-15 4 H-3 A4 4 0 0 0 -3 -4 A5 5 0 0 0 -12 -6 A4.5 4.5 0 0 0 -15 4 Z" />
        <text x={9} y={1}>{zone.turnsLeft}</text>
      </g>
    )
  })
  const meteorEls = meteors.filter(m => m.square).map((m, i) => {
    const { x, y } = atSq(m.square)
    return (
      <g key={`met-${i}`} className="meteor-mark">
        <rect className="meteor-ring" x={x * U + 5} y={y * U + 5} width={U - 10} height={U - 10} rx={8} />
        <g transform={`translate(${x * U + U * 0.8} ${y * U + U * 0.8})`} className="mark-badge meteor">
          <circle r={14} />
          <text y={1}>{m.turnsLeft}</text>
        </g>
      </g>
    )
  })
  const mineEls = mines.filter(m => m.square).map((m, i) => {
    const { x, y } = atSq(m.square)
    return (
      <g key={`mine-${i}`} className="mine-mark" transform={`translate(${x * U + U / 2} ${y * U + U / 2})`}>
        <circle r={16} />
        <path d="M0 -24 V-18 M0 18 V24 M-24 0 H-18 M18 0 H24" />
      </g>
    )
  })
  const frozen = []
  Object.entries(pieces).forEach(([sq, p]) => {
    if (!p.frozen) return
    const { x, y } = atSq(sq)
    frozen.push(<rect key={`fr-${sq}`} x={x * U} y={y * U} width={U} height={U} className="hl-frozen" />)
  })
  const impacts = []
  ;(meteorStrikeAnim?.strikes ?? []).forEach((s, i) => {
    const { x, y } = atSq(s.square)
    impacts.push(
      <g key={`imp-${meteorStrikeAnim.ts}-${i}`} className="impact meteor" transform={`translate(${x * U + U / 2} ${y * U + U / 2})`}>
        <circle className="impact-ring" r={10} />
        <circle className="impact-core" r={20} />
      </g>,
    )
  })
  if (mineStrikeAnim?.strike) {
    const { x, y } = atSq(mineStrikeAnim.strike.square)
    impacts.push(
      <g key={`mimp-${mineStrikeAnim.ts}`} className="impact mine" transform={`translate(${x * U + U / 2} ${y * U + U / 2})`}>
        <circle className="impact-ring" r={10} />
        <circle className="impact-core" r={20} />
      </g>,
    )
  }

  // ── Pointer drag (mouse + touch) ──────────────────────────────────
  const dragRef = useRef(null) // { square, x0, y0, started, rect }
  const [dragGhost, setDragGhost] = useState(null) // { x, y, size, piece }
  const squareAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-square]')
    return el && sceneRef.current?.contains(el) ? el.getAttribute('data-square') : null
  }
  const onPiecePointerDown = (e, sq) => {
    if (!interactive || e.button > 0 || !canDrag?.(sq)) return
    const rect = e.currentTarget.querySelector('.bd-art')?.getBoundingClientRect()
    dragRef.current = { square: sq, x0: e.clientX, y0: e.clientY, started: false, size: rect ? Math.max(rect.width, rect.height) : cell }
  }
  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return
      d.started = true
      onDragStart?.(d.square)
    }
    setDragGhost({ x: e.clientX, y: e.clientY, size: d.size, piece: pieces[d.square] })
    const over = squareAt(e.clientX, e.clientY)
    if (over !== d.over) { d.over = over; onDragOver?.(over) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, onDragStart, onDragOver])
  const onPointerUp = useCallback((e) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.started) {
      setDragGhost(null)
      const to = squareAt(e.clientX, e.clientY)
      suppressRef.current = true
      setTimeout(() => { suppressRef.current = false }, 0)
      if (to && to !== d.square) onDrop?.(d.square, to)
      else onDragCancel?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDrop, onDragCancel])
  const suppressRef = useRef(false)
  useLayoutEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const click = (sq) => {
    if (suppressRef.current) { suppressRef.current = false; return }
    if (interactive) onSquareClick?.(sq)
  }

  // ── Hit cells ─────────────────────────────────────────────────────
  // Squares you can act on (they answer hover — see interactions.css).
  const actionable = new Map()
  if (interactive) highlights.forEach(({ square, kind }) => { if (['home', 'move', 'capture', 'card', 'premove'].includes(kind)) actionable.set(square, kind) })
  const hitSquares = []
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) hitSquares.push(squareName(row, col, rows))
  const outside = [...new Set([...extraCells, ...borderTargets])].filter(sq => !(rankOf(sq) >= 1 && rankOf(sq) <= rows && colOf(sq) >= 0 && colOf(sq) < cols))
  const cells = [...hitSquares, ...outside].map(sq => {
    const { x, y } = atSq(sq)
    const p = pieces[sq]
    return (
      <div
        key={`c-${sq}`}
        className={`bd-cell${actionable.has(sq) ? ' can' : ''}${actionable.get(sq) === 'capture' ? ' cap' : ''}`}
        style={{ left: x * cell, top: y * cell, width: cell, height: cell }}
        data-square={sq}
        data-piece={p ? `${p.color}-${p.type}` : undefined}
        onClick={() => click(sq)}
      />
    )
  })

  // ── Pieces ────────────────────────────────────────────────────────
  const anim = lastMoveAnim
  const pieceEls = Object.entries(pieces).map(([sq, p]) => {
    const { x, y } = atSq(sq)
    let cls = ''
    let style = {}
    let key = sq
    if (anim && (anim.type === 'move' || anim.type === 'capture') && sq === anim.to && anim.from) {
      const f = atSq(anim.from)
      cls = anim.type === 'capture' ? ' capturing' : ' moving'
      style = { '--dx': `${(f.x - x) * cell}px`, '--dy': `${(f.y - y) * cell}px` }
      key = `${sq}-${anim.ts}`
    } else if (anim && anim.type === 'bounce' && sq === anim.from && anim.to) {
      const tt = atSq(anim.to)
      cls = ' bouncing'
      style = { '--dx': `${(tt.x - x) * cell}px`, '--dy': `${(tt.y - y) * cell}px` }
      key = `${sq}-${anim.ts}`
    }
    if (sq === liftSquare) cls += ' lifted'
    if (sq === hideSquare) cls += ' dragging'
    if (p.unstable) cls += ' unstable'
    if (p.frozen) cls += ' frozen'
    if (interactive && canDrag?.(sq)) cls += ' mine'
    const maxHp = p.type === 'king' ? 2 : Math.max(p.hp ?? 1, 1)
    return (
      <div
        key={key}
        className={`bd-piece${cls}`}
        style={{ left: x * cell, top: y * cell, width: cell, height: cell, ...style }}
        data-square={sq}
        data-piece={`${p.color}-${p.type}`}
        onPointerDown={e => onPiecePointerDown(e, sq)}
        onClick={() => click(sq)}
      >
        <div className="bd-stand">
          <Piece type={p.type} color={p.color} className="bd-art" style={{ width: `${pieceScale * 100}%`, height: `${pieceScale * 100}%` }} />
          {(maxHp > 1) && (
            <span className="bd-hp" aria-label={`HP ${p.hp}`}>
              {Array.from({ length: maxHp }, (_, i) => <i key={i} className={i < (p.hp ?? 1) ? 'on' : ''} />)}
            </span>
          )}
          {p.unstable && (
            <span className="bd-unstable">
              <b>{p.unstable.turnsLeft}</b>
              {p.unstable.nextType && <Piece type={p.unstable.nextType} color={p.color} size={Math.max(12, cell * 0.22)} center thin />}
            </span>
          )}
        </div>
      </div>
    )
  })
  if (ghost && !pieces[ghost.square]) {
    const { x, y } = atSq(ghost.square)
    pieceEls.push(
      <div key="ghost" className="bd-piece ghost" style={{ left: x * cell, top: y * cell, width: cell, height: cell }}>
        <div className="bd-stand">
          <Piece type={ghost.type} color={ghost.color} className="bd-art" style={{ width: `${pieceScale * 100}%`, height: `${pieceScale * 100}%` }} />
        </div>
      </div>,
    )
  }

  const ranks = Array.from({ length: rows }, (_, i) => rows - i)
  const files = Array.from({ length: cols }, (_, i) => String.fromCharCode(97 + i))
  if (flipped) { ranks.reverse(); files.reverse() }

  const gridW = cols * cell
  const gridH = rows * cell
  const frameW = gridW + FRAME_PAD * 2 + COORD
  const frameH = gridH + FRAME_PAD * 2 + COORD

  return (
    <div className="bd-scene" ref={sceneRef} {...testAttrs}>
      {cell > 0 && (
        <div className="bd-center" style={{ transform: `translate(${fit.dx}px, ${fit.dy}px)` }}>
        <div
          ref={frameRef}
          className={`bd-frame${fit.tilt ? ' tilted' : ''}`}
          style={{ width: frameW, height: frameH, '--cell': `${cell}px`, '--persp': `${Math.round(frameW * 2.4)}px` }}
        >
          <div className="bd-ranks" style={{ height: gridH }}>
            {ranks.map(r => <span key={r}>{r}</span>)}
          </div>
          <div className="bd-grid" style={{ width: gridW, height: gridH }}>
            <svg className="bd-svg" viewBox={`0 0 ${W} ${H}`} width={gridW} height={gridH} aria-hidden="true">
              <defs>
                <filter id="bd-fog-blur" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
              </defs>
              {voids}
              {squares}
              {hl}
              {frozen}
              {ghostTargets}
              {outlineEls}
              {mineEls}
              {meteorEls}
              <g className="fog-layer" filter="url(#bd-fog-blur)">{fog}</g>
              {fogBadges}
              {impacts}
            </svg>
            {cells}
            {pieceEls}
            {children?.({ cell, atSq })}
          </div>
          <div className="bd-files" style={{ width: gridW }}>
            {files.map(f => <span key={f}>{f}</span>)}
          </div>
        </div>
        </div>
      )}
      {dragGhost && createPortal(
        <div className="bd-drag-ghost" style={{ left: dragGhost.x, top: dragGhost.y, width: dragGhost.size, height: dragGhost.size }}>
          {dragGhost.piece && <Piece type={dragGhost.piece.type} color={dragGhost.piece.color} size={dragGhost.size} />}
        </div>,
        document.body,
      )}
    </div>
  )
}

function SquareRect({ x, y, dark }) {
  return (
    <g>
      <rect x={x} y={y} width={U} height={U} className={dark ? 'sq-dark' : 'sq-light'} shapeRendering="crispEdges" />
      <rect x={x} y={y} width={U} height={3} className="sq-gloss" shapeRendering="crispEdges" />
      <rect x={x} y={y + U - 5} width={U} height={5} className="sq-shade" shapeRendering="crispEdges" />
    </g>
  )
}
