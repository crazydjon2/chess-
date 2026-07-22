import { useState } from 'react'
import { homeRanks } from '../game/boardPatterns'
import { PIECE_LABEL } from '../game/economy'
import { CARD_DEFS } from '../game/cards'
import { PIECE_ICONS } from './pieceIcons'
import MatchScoreBoard from './MatchScoreBoard'
import './PlacementPhase.css'

function zoneFor(rank, myRange, oppRange) {
  if (rank >= myRange[0] && rank <= myRange[1]) return 'mine'
  if (rank >= oppRange[0] && rank <= oppRange[1]) return 'opp'
  return 'neutral'
}

// Hidden setup screen — the opponent's PLACEMENT MAP (where they put each
// piece) never leaks over the network until both sides have submitted (the
// server only ever forwards a redacted { ready: bool } for the other side).
// Their drafted army (pieces/cards) is a different story: that was already
// public during the draft phase (see DraftPhase.jsx, picks are visible to
// both as they happen), so there's no reason to hide it here too — only
// WHERE they'll place it stays secret. No king — draft mode has none, see
// chess.js eliminationMode. Every round is a fresh draft (nothing survives
// from a previous round — see matchEngine.js), so `draftedPieces` is
// everything there is to place.
//
// v2 "stacked" layout: both rosters live in slim horizontal trays pinned
// above/below the board (see DraftPhase.jsx's matching v2 redesign),
// instead of wide side columns flanking it.
export default function PlacementPhase({
  boardPattern, draftedPieces, myCards = [], myColor, opponentReady, onSubmit,
  oppColor, oppPieces = [], oppCards = [], matchScore,
}) {
  const [placement, setPlacement]       = useState({})
  const [selectedType, setSelectedType] = useState(null)
  const [submitted, setSubmitted]       = useState(false)

  const placedTypes = Object.values(placement)
  const remaining = [...draftedPieces]
  placedTypes.forEach(t => {
    const idx = remaining.indexOf(t)
    if (idx !== -1) remaining.splice(idx, 1)
  })

  const { rows, cols, blockedCells = [] } = boardPattern
  const blocked = new Set(blockedCells)
  const myRange  = homeRanks(rows, myColor)
  const oppRange = homeRanks(rows, oppColor)

  function squareName(col, rank) { return `${String.fromCharCode(97 + col)}${rank}` }

  function handleSquareClick(sq, zone) {
    if (submitted || blocked.has(sq) || zone !== 'mine') return
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

  const remainingCount = remaining.length
  const canSubmit = remainingCount === 0 && !submitted

  const submitState = remainingCount > 0 ? 'incomplete' : !submitted ? 'ready' : opponentReady ? 'both' : 'waiting'
  const submitLabel = {
    incomplete: `Осталось: ${remainingCount}`,
    ready: 'Готово',
    waiting: 'Ждём соперника…',
    both: 'Начинаем бой…',
  }[submitState]

  return (
    <div className="pl-screen">
      <div className="pl-header">
        <div>
          <div className="pl-title">Расставь свою армию</div>
          <div className="pl-subtitle">Соперник не видит эту доску, пока оба не будут готовы</div>
        </div>
        {matchScore && <MatchScoreBoard {...matchScore} />}
      </div>

      <div className="pl-tray pl-tray-opp">
        <span className="pl-tray-edge" />
        <span className="pl-tray-label">Набор соперника</span>
        <span className="pl-tray-sub">({oppColor === 'white' ? 'белые' : 'чёрные'})</span>
        <span className="pl-tray-divider" />
        <span className="pl-tray-count opp">{oppPieces.length} фигур</span>
        <span className="pl-tray-divider" />
        <div className="pl-tray-fade">
          <div className="pl-tray-chips">
            {oppPieces.map((type, i) => (
              <span className="pl-tray-piece" key={`${type}-${i}`} title={PIECE_LABEL[type]}>
                {PIECE_ICONS[oppColor][type]}
              </span>
            ))}
          </div>
        </div>
        {oppCards.length > 0 && (
          <>
            <span className="pl-tray-divider" />
            <div className="pl-tray-fade shrink">
              <div className="pl-tray-chips">
                {oppCards.map((cardId, i) => (
                  <span
                    className="pl-tray-cardbadge" key={`${cardId}-${i}`}
                    style={{ background: CARD_DEFS[cardId].accent }}
                    title={CARD_DEFS[cardId].name}
                  >
                    {CARD_DEFS[cardId].glyph}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="pl-main">
        {/* Balances .pl-piece-rail's width on the other side so the board
           is truly centered in the row — without this the board sat
           visibly shifted left of where it sits in battle (see
           GameView.jsx's matching .bt-main-spacer), even though the full-
           width trays above/below it lined up the same in both screens. */}
        <span className="pl-main-spacer" />
        <div className="pl-board-wrap">
          <div
            className="pl-board"
            /* minmax(0, 1fr), NOT plain 1fr — a bare `1fr` is `minmax(auto,
               1fr)`, and that `auto` floor won't let a track shrink below
               its content's min size. A tall piece (the rook's viewBox is
               82 units tall) placed in a cell then forced its row taller
               than the others, so the board stopped being square and
               visibly jumped the moment you dropped one in. minmax(0,1fr)
               pins every track to an equal share regardless of content. */
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
          >
            {ranks.map(rank => files.map(col => {
              const sq = squareName(col, rank)
              const isBlocked = blocked.has(sq)
              const dark = (rank + col) % 2 === 1
              if (isBlocked) {
                return (
                  <span key={sq} className={`pl-cell-gap${dark ? ' dark' : ''}`}>
                    <svg viewBox="0 0 100 100" className="pl-cell-gap-x">
                      <line x1="22" y1="22" x2="78" y2="78" stroke="rgba(180,50,35,0.80)" strokeWidth="7" strokeLinecap="round" />
                      <line x1="78" y1="22" x2="22" y2="78" stroke="rgba(180,50,35,0.80)" strokeWidth="7" strokeLinecap="round" />
                    </svg>
                  </span>
                )
              }
              const zone = zoneFor(rank, myRange, oppRange)
              const piece = placement[sq]
              const droppable = !!selectedType && zone === 'mine' && !piece
              const cellTitle =
                zone === 'opp' ? 'Чужая половина — недоступна для расстановки'
                : zone === 'neutral' ? 'Нейтральная зона — не задействована в расстановке'
                : piece ? `${PIECE_LABEL[piece]} — нажмите, чтобы убрать обратно в лоток`
                : droppable ? `Поставить сюда: ${PIECE_LABEL[selectedType]}`
                : 'Можно поставить фигуру'
              return (
                <button
                  key={sq}
                  className={`pl-cell${dark ? ' dark' : ''} ${zone}${piece ? ' occupied' : ''}${droppable ? ' droppable' : ''}`}
                  disabled={zone !== 'mine' || submitted}
                  onClick={() => handleSquareClick(sq, zone)}
                  title={cellTitle}
                >
                  {piece && <span className="pl-cell-icon">{PIECE_ICONS[myColor][piece]}</span>}
                </button>
              )
            }))}
          </div>
        </div>

        {/* The pieces still waiting to go on the board — a big card-style
           rail beside the board, same shape/size as CardHand's real cards
           in the actual battle screen, not a small icon-only lot. */}
        <div className="pl-piece-rail">
          {remaining.map((type, i) => (
            <button
              key={`${type}-${i}`}
              className={`pl-piece-card${selectedType === type ? ' selected' : ''}`}
              disabled={submitted}
              onClick={() => setSelectedType(cur => (cur === type ? null : type))}
            >
              <span className="pl-piece-card-icon">{PIECE_ICONS[myColor][type]}</span>
              <span className="pl-piece-card-name">{PIECE_LABEL[type]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pl-tray pl-tray-mine active">
        <span className="pl-tray-edge" />
        <span className="pl-tray-label">Ваш набор</span>
        <span className="pl-tray-count mine">Осталось: {remainingCount}</span>
        {myCards.length > 0 && (
          <>
            <span className="pl-tray-divider" />
            <div className="pl-tray-fade shrink">
              <div className="pl-tray-chips">
                {myCards.map((cardId, i) => (
                  <span
                    className="pl-tray-cardbadge" key={`${cardId}-${i}`}
                    style={{ background: CARD_DEFS[cardId].accent }}
                    title={CARD_DEFS[cardId].name}
                  >
                    {CARD_DEFS[cardId].glyph}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        <span className="pl-tray-divider" />
        <button className={`pl-submit-btn ${submitState}`} disabled={!canSubmit} onClick={handleReady}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
