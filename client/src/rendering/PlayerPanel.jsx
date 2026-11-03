import OpponentHand from './OpponentHand'
import Clock from './Clock'
import { PIECE_GLYPHS, CAPTURE_ORDER } from '../game/economy'

// One horizontal tray — opponent pinned above the board, yours pinned
// below (see GameView.jsx's .bt-tray-opp / .bt-tray-mine). `isYou` drives
// the "mine vs opponent" gold/dark accent that stays fixed all match even
// though the actual piece `color` swaps every round (see matchEngine.js) —
// the same convention the draft/placement trays use for their own bars.
export default function PlayerPanel({
  color, capturedByMe, active, inCheck, isYou,
  opponentCards, selectedCardId, onCardClick,
  timeSeconds, turnStartedAt, ticking,
  characterName,
  onSurrender,
  // Draw offer button (online only): onOfferDraw undefined hides it;
  // drawOfferDisabled greys it out (offer already standing, or already
  // offered this move).
  onOfferDraw, drawOfferDisabled,
  // `active` is purely visual (turn highlight/dot). `controllable` gates
  // whether the opponent hand can actually be clicked — online mode forces
  // this false on the opponent's panel so a player can inspect but never
  // act on the other side's turn.
  controllable,
  name,
}) {
  const canControl = controllable ?? active
  const colorLabel = color === 'white' ? 'Белые' : 'Чёрные'
  const label  = name || colorLabel
  const glyphs = PIECE_GLYPHS[color === 'white' ? 'black' : 'white']
  const sorted = [...capturedByMe].sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b))

  return (
    <div className={`player-panel ${isYou ? 'mine' : 'opp'}${active ? ' active' : ''}${inCheck ? ' in-check' : ''}`}>
      <span className="pp-edge" />
      {active && <span className="pp-turn-badge">ХОДИТ</span>}

      <span className="player-avatar">
        {color === 'white' ? '♔' : '♚'}
        <span className={`pp-turn-dot${active ? ' active' : ''}`} />
      </span>

      <div className="player-body">
        <div className="player-name-row">
          <span className="player-name">{label}</span>
          <span className={`player-color-tag p-${color}`}>{colorLabel}</span>
          {characterName && <span className="player-character">{characterName}</span>}
          {inCheck && <span className="check-badge">ШАХ</span>}
        </div>
        <Clock
          baseSeconds={timeSeconds}
          turnStartedAt={turnStartedAt}
          ticking={ticking}
        />
      </div>

      <span className="pp-divider" />
      <div className="player-captures">
        {sorted.length === 0 && <span className="pp-captures-empty">—</span>}
        {sorted.map((type, i) => (
          <span key={i} className="cap-glyph">{glyphs[type]}</span>
        ))}
      </div>

      {opponentCards && (
        <>
          <span className="pp-divider" />
          <OpponentHand
            cards={opponentCards}
            isActive={canControl}
            selectedCardId={selectedCardId}
            onCardClick={onCardClick}
          />
        </>
      )}

      {isYou && (onSurrender || onOfferDraw) && (
        <>
          <span className="pp-divider" />
          {onOfferDraw && (
            <button className="draw-btn" onClick={onOfferDraw} disabled={drawOfferDisabled} title="Предложить ничью">
              ½
            </button>
          )}
          {onSurrender && (
            <button className="surrender-btn" onClick={onSurrender} title="Сдаться">
              🏳
            </button>
          )}
        </>
      )}
    </div>
  )
}
