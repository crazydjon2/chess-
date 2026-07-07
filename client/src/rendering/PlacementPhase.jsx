import { useState } from 'react'
import { homeRanks } from '../game/boardPatterns'
import { PIECE_GLYPHS, PIECE_LABEL } from '../game/economy'
import { CARD_DEFS } from '../game/cards'
import './PlacementPhase.css'

// Hidden setup screen — the opponent's PLACEMENT MAP (where they put each
// piece) never leaks over the network until both sides have submitted (the
// server only ever forwards a redacted { ready: bool } for the other side).
// Their drafted army (pieces/cards) is a different story: that was already
// public during the draft phase (see DraftPhase.jsx, picks are visible to
// both as they happen), so there's no reason to hide it here too — only
// WHERE they'll place it stays secret. No king — draft mode has none, see
// chess.js eliminationMode. `carryOverPieces` are survivors from a previous
// round — they need placing again too, since each round's board is a
// different size/pattern.
export default function PlacementPhase({
  boardPattern, draftedPieces, carryOverPieces = [], myColor, opponentReady, onSubmit,
  oppColor, oppPieces = [], oppCards = [],
}) {
  const allTypes = [...carryOverPieces, ...draftedPieces]
  const [placement, setPlacement]     = useState({})
  const [selectedType, setSelectedType] = useState(null)
  const [submitted, setSubmitted]     = useState(false)

  const placedTypes = Object.values(placement)
  const remaining = [...allTypes]
  placedTypes.forEach(t => {
    const idx = remaining.indexOf(t)
    if (idx !== -1) remaining.splice(idx, 1)
  })

  const { rows, cols, blockedCells = [] } = boardPattern
  const blocked = new Set(blockedCells)
  const [homeLo, homeHi] = homeRanks(rows, myColor)

  function squareName(col, rank) { return `${String.fromCharCode(97 + col)}${rank}` }

  function handleSquareClick(sq, rank) {
    if (submitted) return
    if (rank < homeLo || rank > homeHi) return
    if (blocked.has(sq)) return

    if (placement[sq]) {
      const next = { ...placement }
      delete next[sq]
      setPlacement(next)
      return
    }
    if (selectedType) {
      setPlacement({ ...placement, [sq]: selectedType })
      setSelectedType(null)
    }
  }

  function handleReady() {
    if (remaining.length > 0 || submitted) return
    setSubmitted(true)
    onSubmit(placement)
  }

  const ranks = Array.from({ length: rows }, (_, i) => rows - i) // top..bottom
  const files = Array.from({ length: cols }, (_, i) => i)

  return (
    <div className="placement-screen">
      <div className="placement-title">Расставь свою армию</div>
      <div className="placement-sub">
        Соперник не видит эту доску, пока оба не будут готовы
        {carryOverPieces.length > 0 && ` · ${carryOverPieces.length} фигур(ы) перенесено с прошлого раунда`}
      </div>

      <div className="placement-layout">
        <div className="placement-tray">
          <div className="placement-tray-title">Осталось поставить</div>
          <div className="placement-tray-items">
            {remaining.length === 0 && <span className="placement-tray-empty">всё расставлено</span>}
            {remaining.map((type, i) => (
              <button
                key={`${type}-${i}`}
                className={`placement-tray-piece${selectedType === type ? ' selected' : ''}`}
                onClick={() => setSelectedType(type === selectedType ? null : type)}
                disabled={submitted}
                title={PIECE_LABEL[type]}
              >
                {PIECE_GLYPHS[myColor][type]}
              </button>
            ))}
          </div>
        </div>

        <div
          className="placement-board"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {ranks.map(rank => files.map(col => {
            const sq = squareName(col, rank)
            const inHome = rank >= homeLo && rank <= homeHi
            const isBlocked = blocked.has(sq)
            const dark = (rank + col) % 2 === 1
            const piece = placement[sq]
            return (
              <button
                key={sq}
                className={
                  'placement-cell' +
                  (dark ? ' dark' : '') +
                  (inHome && !isBlocked ? ' home' : '') +
                  (isBlocked ? ' blocked' : '')
                }
                disabled={!inHome || isBlocked || submitted}
                onClick={() => handleSquareClick(sq, rank)}
              >
                {piece && <span className="placement-piece-glyph">{PIECE_GLYPHS[myColor][piece]}</span>}
                {isBlocked && <span className="placement-blocked-x">✕</span>}
              </button>
            )
          }))}
        </div>

        <div className="placement-tray placement-opp-tray">
          <div className="placement-tray-title">
            <span className={`placement-opp-dot p-${oppColor}`} />
            Армия соперника ({oppColor === 'white' ? 'белые' : 'чёрные'})
          </div>
          <div className="placement-tray-items">
            {oppPieces.map((type, i) => (
              <span key={`p-${type}-${i}`} className="placement-tray-piece" title={PIECE_LABEL[type]}>
                {PIECE_GLYPHS[oppColor][type]}
              </span>
            ))}
          </div>
          <div className="placement-tray-items">
            {oppCards.map((cardId, i) => (
              <span key={`c-${cardId}-${i}`} className="placement-tray-piece" title={CARD_DEFS[cardId].name}>
                {CARD_DEFS[cardId].glyph}
              </span>
            ))}
          </div>
        </div>
      </div>

      {submitted ? (
        <div className="placement-waiting">
          {opponentReady ? 'Оба готовы — начинаем бой…' : 'Ждём соперника…'}
        </div>
      ) : (
        <button className="placement-ready-btn" disabled={remaining.length > 0} onClick={handleReady}>
          {remaining.length > 0 ? `Осталось: ${remaining.length}` : 'Готово'}
        </button>
      )}
    </div>
  )
}
