import { useState } from 'react'
import { homeRanks } from '../game/boardPatterns'
import { PIECE_LABEL } from '../game/economy'
import { CARD_DEFS } from '../game/cards'
import { PIECE_ICONS } from './pieceIcons'
import MatchScoreBoard from './MatchScoreBoard'
import Clock from './Clock'
import GameCard from './GameCard'
import SideDrawer from './SideDrawer'
import useFitSquare from './useFitSquare'
import { play } from '../sound'
import './PlacementPhase.css'

function zoneFor(rank, myRange, oppRange) {
  if (rank >= myRange[0] && rank <= myRange[1]) return 'mine'
  if (rank >= oppRange[0] && rank <= oppRange[1]) return 'opp'
  return 'neutral'
}

// Open, simultaneous setup screen — both sides arrange at the same time and
// see each other's board live (every change is pushed via onChange, see
// matchEngine.js's tryUpdatePlacement), against a shared countdown. At zero
// the server locks both boards in as they stand (see forcePlacement), so
// waiting the opponent out buys nothing. The free king (see draftEngine.js)
// is drafted like any other piece. Every round is a fresh draft (nothing survives
// from a previous round — see matchEngine.js), so `draftedPieces` is
// everything there is to place.
//
// v2 "stacked" layout: both rosters live in slim horizontal trays pinned
// above/below the board (see DraftPhase.jsx's matching v2 redesign),
// instead of wide side columns flanking it.
export default function PlacementPhase({
  boardPattern, draftedPieces, myCards = [], myColor, opponentReady, onSubmit, onChange,
  myMap, oppMap = {}, deadline, totalSeconds,
  oppColor, oppPieces = [], oppCards = [], matchScore,
}) {
  // Seeded from the server's copy so a remount mid-phase doesn't wipe it.
  const [placement, setPlacementState]  = useState(() => myMap ?? {})
  const [selectedType, setSelectedType] = useState(null)
  const [submitted, setSubmitted]       = useState(false)
  // Mobile: pieces live in a slide-out side panel (see SideDrawer); desktop
  // keeps the always-visible rail beside the board.
  const [deckOpen, setDeckOpen]         = useState(false)

  const placedTypes = Object.values(placement)
  const remaining = [...draftedPieces]
  placedTypes.forEach(t => {
    const idx = remaining.indexOf(t)
    if (idx !== -1) remaining.splice(idx, 1)
  })

  const { rows, cols, blockedCells = [] } = boardPattern
  const blocked = new Set(blockedCells)
  // Exact-fit square, same as the battle board (see useFitSquare) — no CSS
  // clamp that would squish the cells out of square.
  const [boardWrapRef, fit] = useFitSquare(cols, rows)
  const myRange  = homeRanks(rows, myColor)
  const oppRange = homeRanks(rows, oppColor)

  function setPlacement(next) {
    setPlacementState(next)
    onChange?.(next)
  }

  function squareName(col, rank) { return `${String.fromCharCode(97 + col)}${rank}` }

  function handleSquareClick(sq, zone) {
    if (submitted || blocked.has(sq) || zone !== 'mine') return
    if (placement[sq]) {
      const next = { ...placement }
      delete next[sq]
      setPlacement(next)
      play('select')
      return
    }
    if (selectedType) {
      setPlacement({ ...placement, [sq]: selectedType })
      setSelectedType(null)
      play('move')
    }
  }

  function handleReady() {
    if (remaining.length > 0 || submitted) return
    setSubmitted(true)
    onSubmit(placement) // the submit button's 'click' comes from the global listener (sound.js)
  }

  // Black sees the board turned 180° — the same orientation as its battle
  // board (see coords.js's cellXY), so your own rows are always at the
  // bottom and nothing jumps sides when the battle starts.
  const flipped = myColor === 'black'
  const ranks = Array.from({ length: rows }, (_, i) => (flipped ? i + 1 : rows - i)) // top..bottom
  const files = Array.from({ length: cols }, (_, i) => (flipped ? cols - 1 - i : i))

  const remainingCount = remaining.length
  const canSubmit = remainingCount === 0 && !submitted

  const submitState = remainingCount > 0 ? 'incomplete' : !submitted ? 'ready' : opponentReady ? 'both' : 'waiting'
  const submitLabel = {
    // "Готово" (disabled) even while incomplete — the "Осталось: N" count
    // already lives in the tray's count badge, so repeating it on the button
    // was a duplicate of the same number right next to itself.
    incomplete: 'Готово',
    ready: 'Готово',
    waiting: 'Ждём соперника…',
    both: 'Начинаем бой…',
  }[submitState]

  return (
    <div className="pl-screen">
      {/* No "Расставь свою армию" caption — the board + the "Фигуры" deck
         make the phase obvious. Header carries only the match score. */}
      <div className="pl-header">
        {matchScore && <MatchScoreBoard {...matchScore} />}
      </div>

      <div className="pl-tray pl-tray-opp">
        <span className="pl-tray-edge" />
        <div className="pl-tray-top">
          <span className="pl-tray-label">Набор соперника</span>
          <span className="pl-tray-sub">({oppColor === 'white' ? 'белые' : 'чёрные'})</span>
          <span className="pl-tray-count opp">{opponentReady ? 'Готов' : `${oppPieces.length} фигур`}</span>
        </div>
        {/* Roster is its own row (own line on mobile) so the opponent's
           pieces are legible; same robust two-part layout as the draft tray. */}
        <div className="pl-tray-roster">
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
          )}
        </div>
      </div>

      <div className="pl-main">
        {/* Balances .pl-piece-rail's width on the other side so the board
           is truly centered in the row — without this the board sat
           visibly shifted left of where it sits in battle (see
           GameView.jsx's matching .bt-main-spacer), even though the full-
           width trays above/below it lined up the same in both screens. */}
        <span className="pl-main-spacer" />
        <div className="pl-board-wrap" ref={boardWrapRef}>
          <div
            className="pl-board"
            /* minmax(0, 1fr), NOT plain 1fr — a bare `1fr` is `minmax(auto,
               1fr)`, and that `auto` floor won't let a track shrink below
               its content's min size. A tall piece (the rook's viewBox is
               82 units tall) placed in a cell then forced its row taller
               than the others, so the board stopped being square and
               visibly jumped the moment you dropped one in. minmax(0,1fr)
               pins every track to an equal share regardless of content.
               width/height come from useFitSquare so the grid is an exact
               square (cells stay square) instead of a CSS-clamped rectangle. */
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              ...(fit ? { width: fit.w, height: fit.h } : null),
            }}
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
              const oppPiece = zone === 'opp' ? oppMap?.[sq] : null
              const droppable = !!selectedType && zone === 'mine' && !piece
              const cellTitle =
                zone === 'opp' ? (oppPiece ? PIECE_LABEL[oppPiece] : 'Чужая половина — недоступна для расстановки')
                : zone === 'neutral' ? 'Нейтральная зона — не задействована в расстановке'
                : piece ? `${PIECE_LABEL[piece]} — нажмите, чтобы убрать обратно в лоток`
                : droppable ? `Поставить сюда: ${PIECE_LABEL[selectedType]}`
                : 'Можно поставить фигуру'
              return (
                <button
                  key={sq}
                  className={`pl-cell${dark ? ' dark' : ''} ${zone}${piece ? ' occupied' : ''}${droppable ? ' droppable' : ''}`}
                  data-square={sq}
                  disabled={zone !== 'mine' || submitted}
                  onClick={() => handleSquareClick(sq, zone)}
                  title={cellTitle}
                >
                  {piece && <span className="pl-cell-icon">{PIECE_ICONS[myColor][piece]}</span>}
                  {oppPiece && <span className="pl-cell-icon">{PIECE_ICONS[oppColor][oppPiece]}</span>}
                </button>
              )
            }))}
          </div>
        </div>

        {/* The pieces still waiting to go on the board — a big card-style
           rail beside the board, same shape/size as CardHand's real cards
           in the actual battle screen, not a small icon-only lot. */}
        {/* Desktop: always-visible rail beside the board. */}
        <div className="pl-piece-rail">
          {remaining.map((type, i) => (
            <GameCard
              key={`${type}-${i}`}
              variant="piece"
              icon={PIECE_ICONS[myColor][type]}
              name={PIECE_LABEL[type]}
              selected={selectedType === type}
              disabled={submitted}
              onClick={() => { play('select'); setSelectedType(cur => (cur === type ? null : type)) }}
            />
          ))}
        </div>

        {/* Mobile: pieces in a slide-out side panel so the board keeps the
           full height (same layout as the battle screen → no jump between
           the two phases). Pick a piece → panel closes → tap a highlighted
           cell to place it; "Отмена" clears the pick. */}
        <SideDrawer
          icon="♟"
          label="Фигуры"
          count={remaining.length}
          title="Расставь фигуры"
          armed={selectedType != null}
          armedLabel="Отменить фигуру"
          onCancel={() => setSelectedType(null)}
          open={deckOpen}
          onOpenChange={setDeckOpen}
          disabled={submitted || remaining.length === 0}
          emptyText="Все расставлены"
        >
          {remaining.map((type, i) => (
            <GameCard
              key={`${type}-${i}`}
              variant="piece"
              icon={PIECE_ICONS[myColor][type]}
              name={PIECE_LABEL[type]}
              selected={selectedType === type}
              disabled={submitted}
              onClick={() => { play('select'); setSelectedType(type); setDeckOpen(false) }}
            />
          ))}
        </SideDrawer>
      </div>

      <div className="pl-tray pl-tray-mine active">
        <span className="pl-tray-edge" />
        <div className="pl-tray-top">
          <span className="pl-tray-label">Ваш набор</span>
          <span className="pl-tray-count mine">Осталось: {remainingCount}</span>
          {deadline != null && (
            <Clock
              baseSeconds={totalSeconds}
              turnStartedAt={deadline - totalSeconds * 1000}
              ticking
              lowSeconds={10}
            />
          )}
          <button className={`pl-submit-btn ${submitState}`} disabled={!canSubmit} onClick={handleReady}>
            {submitLabel}
          </button>
        </div>
        {myCards.length > 0 && (
          <div className="pl-tray-roster">
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
          </div>
        )}
      </div>
    </div>
  )
}
