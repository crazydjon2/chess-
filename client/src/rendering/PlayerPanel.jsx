import OpponentHand from './OpponentHand'
import { PIECE_GLYPHS, CAPTURE_ORDER } from '../game/economy'

export default function PlayerPanel({
  color, capturedByMe, active, inCheck, isYou,
  opponentCards, selectedCardId, onCardClick,
  coins,
  characterName,
  onSurrender,
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
    <div className={`player-panel ${active ? 'active' : ''} ${inCheck ? 'in-check' : ''} ${isYou ? 'is-you' : ''}`}>
      <div className={`player-avatar p-${color}`}>
        {color === 'white' ? '♔' : '♚'}
      </div>
      <div className="player-body">
        <div className="player-name-row">
          <span className="player-name">{label}</span>
          {name && <span className={`player-color-tag p-${color}`}>{colorLabel}</span>}
          {characterName && <span className="player-character">{characterName}</span>}
          {isYou && <span className="you-badge">ВЫ</span>}
          {inCheck && <span className="check-badge">ШАХ</span>}
        </div>
        <div className="player-captures">
          {sorted.map((type, i) => (
            <span key={i} className="cap-glyph">{glyphs[type]}</span>
          ))}
        </div>
      </div>
      {coins != null && (
        <span className="coin-badge" title="Перейдёт в бюджет следующего драфта">
          🪙 {coins}
        </span>
      )}
      {opponentCards && (
        <OpponentHand
          cards={opponentCards}
          isActive={canControl}
          selectedCardId={selectedCardId}
          onCardClick={onCardClick}
        />
      )}
      {isYou && onSurrender && (
        <button className="surrender-btn" onClick={onSurrender} title="Сдаться">
          🏳
        </button>
      )}
      {active && <span className="turn-dot" />}
    </div>
  )
}
