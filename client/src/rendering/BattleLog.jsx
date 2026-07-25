import { PIECE_GLYPHS, PIECE_LABEL } from '../game/economy'
import { CARD_DEFS } from '../game/cards'
import './BattleLog.css'

// One entry's icon+text — reads straight off what appendLogEntry (chess.js)
// stored, never re-derives anything from game rules. For a move, the piece
// glyph comes from the entry's OWN snapshot (pieces AFTER the move landed)
// rather than needing the mover's piece type as a separate field.
function describeEntry(entry) {
  if (entry.kind === 'start') return { glyph: '🏁', text: 'Начальная позиция' }
  if (entry.kind === 'move') {
    // Redacted server-side (see rooms.js's redactActionLogEntry) whenever
    // this move's own from/to fell inside the mover's own still-live fog
    // zone — no square shown, same "something happened, not where" the
    // live board already gives for a caster's own hidden pieces.
    if (entry.hidden) {
      return { glyph: '☁', text: `${entry.color === 'white' ? 'Белые' : 'Чёрные'} сходили в тумане` }
    }
    const piece = entry.snapshot.pieces[entry.to]
    const glyph = piece ? PIECE_GLYPHS[entry.color][piece.type] : PIECE_GLYPHS[entry.color].pawn
    const captureText = entry.capturedType ? ` ×${PIECE_LABEL[entry.capturedType]}` : ''
    return { glyph, text: `${entry.from} → ${entry.to}${captureText}` }
  }
  // kind === 'card' — which card was cast is never secret (the opponent
  // already experiences it — a mine triggering, a zone appearing); only
  // ITS TARGET can be hidden (`entry.hidden`, no `entry.target` — see
  // rooms.js's redactActionLogEntry), which the log never shows anyway.
  const card = CARD_DEFS[entry.cardId]
  return { glyph: card.glyph, text: card.name, accent: card.accent }
}

// A docked, non-blocking panel (never covers the board) listing every move
// and card played this round — click any entry to see the board exactly as
// it was right after that action landed. Selecting an entry never sends
// anything to the server; it's a pure local view swap (see GameView.jsx's
// displayGameState) — the live match keeps running underneath regardless
// of what you're currently looking at.
export default function BattleLog({ entries, historyIndex, onSelect, onReturnToLive, onClose, isMyLiveTurn, closing }) {
  const liveIndex = entries.length - 1
  const viewingIndex = historyIndex ?? liveIndex

  return (
    <div className={`bl-panel${closing ? ' closing' : ''}`}>
      <div className="bl-header">
        <span className="bl-title">Журнал боя</span>
        <button className="bl-close" onClick={onClose} title="Закрыть">✕</button>
      </div>

      {historyIndex != null && (
        <button className={`bl-return${isMyLiveTurn ? ' urgent' : ''}`} onClick={onReturnToLive}>
          {isMyLiveTurn ? '⚠ Сейчас ваш ход — вернуться в игру' : '↩ Вернуться в игру'}
        </button>
      )}

      <div className="bl-list">
        {entries.map((entry, i) => {
          const { glyph, text, accent } = describeEntry(entry)
          const isSelected = i === viewingIndex
          const isLive = i === liveIndex && historyIndex == null
          return (
            <button
              key={i}
              className={`bl-entry${isSelected ? ' selected' : ''}${entry.color ? ` p-${entry.color}` : ''}`}
              style={accent ? { '--accent': accent } : undefined}
              onClick={() => (i === liveIndex ? onReturnToLive() : onSelect(i))}
            >
              <span className="bl-entry-index">{i}</span>
              {entry.color && <span className={`bl-entry-dot p-${entry.color}`} />}
              <span className="bl-entry-glyph">{glyph}</span>
              <span className="bl-entry-text">{text}</span>
              {isLive && <span className="bl-entry-live">live</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
