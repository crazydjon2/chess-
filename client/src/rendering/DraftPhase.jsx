import { getCurrentPicker, getAvailableChoices } from '../game/draftEngine'
import { DRAFT_TURN_ORDER } from '../game/draftPools'
import { CARD_DEFS } from '../game/cards'
import { PIECE_GLYPHS, PIECE_LABEL, shopPieceCost } from '../game/economy'
import BoardThumbnail from './BoardThumbnail'
import './DraftPhase.css'

export default function DraftPhase({ round, boardPattern, draft, carryOver, myColor, onPick }) {
  const picker    = getCurrentPicker(draft)
  const isMyTurn  = picker === myColor
  const oppColor  = myColor === 'white' ? 'black' : 'white'
  const { pieces, cards } = getAvailableChoices(draft)
  const myBudget  = draft.budgets[myColor]
  const oppBudget = draft.budgets[oppColor]

  // Whose slot each of the 10 total TURNS belongs to, in order — this is
  // still exactly 10 fixed turns regardless of budget (see draftEngine.js),
  // it's just that a turn may now be spent passing instead of buying, so
  // this timeline tracks turns taken, not items acquired.
  const pickOrder    = DRAFT_TURN_ORDER.map(slot => slot === 'first' ? draft.firstColor : draft.secondColor)
  const myRemaining  = pickOrder.slice(draft.turnIndex).filter(c => c === myColor).length
  const oppRemaining = pickOrder.slice(draft.turnIndex).filter(c => c === oppColor).length

  return (
    <div className="draft-screen">
      <div className="draft-header">
        <div className="draft-header-text">
          <span className="draft-round">Раунд {round}</span>
          <span className="draft-board-name">{boardPattern.name} · {boardPattern.rows}×{boardPattern.cols}</span>
        </div>
        <BoardThumbnail boardPattern={boardPattern} />
      </div>

      <div className="draft-budgets">
        <div className="draft-budget mine">
          <span className="draft-budget-label">Ваш бюджет</span>
          <span className="draft-budget-value">🪙 {myBudget}</span>
        </div>
        <div className="draft-budget opp">
          <span className="draft-budget-label">Бюджет соперника</span>
          <span className="draft-budget-value">🪙 {oppBudget}</span>
        </div>
      </div>

      <div className="draft-timeline-wrap">
        <div className="draft-timeline">
          {pickOrder.map((color, i) => {
            const status = i < draft.turnIndex ? 'done' : i === draft.turnIndex ? 'current' : 'upcoming'
            const side   = color === myColor ? 'mine' : 'opp'
            return (
              <div
                key={i}
                className={`draft-timeline-pip ${side} ${status}`}
                title={`Ход ${i + 1}: ${color === myColor ? 'ваш' : 'соперника'}`}
              >
                {i + 1}
              </div>
            )
          })}
        </div>
        <div className="draft-timeline-legend">
          <span className="legend-mine">Ваших ходов осталось: <b>{myRemaining}</b></span>
          <span className="legend-opp">Ходов соперника осталось: <b>{oppRemaining}</b></span>
        </div>
      </div>

      <div className={`draft-turn-banner${isMyTurn ? ' mine' : ''}`}>
        {isMyTurn ? 'Твой ход — купи фигуру, карту, или пропусти' : 'Соперник выбирает…'}
      </div>

      <div className="draft-pools">
        <div className="draft-pool-group">
          <div className="draft-pool-title">
            Фигуры <span className="draft-pool-remaining">осталось: {pieces.length}</span>
          </div>
          <div className="draft-pool-items">
            {pieces.length === 0 && <span className="draft-pool-empty">разобраны</span>}
            {pieces.map((type, i) => {
              const price = shopPieceCost(type)
              const affordable = price <= myBudget
              return (
                <button
                  key={`${type}-${i}`}
                  className={`draft-pick-btn${affordable ? '' : ' unaffordable'}`}
                  disabled={!isMyTurn || !affordable}
                  title={!affordable ? 'Не хватает бюджета' : undefined}
                  onClick={() => onPick({ kind: 'piece', pieceType: type })}
                >
                  <span className="draft-pick-glyph">{PIECE_GLYPHS.white[type]}</span>
                  <span className="draft-pick-label">{PIECE_LABEL[type]}</span>
                  <span className="draft-pick-price">🪙 {price}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="draft-pool-group">
          <div className="draft-pool-title">
            Карты <span className="draft-pool-remaining">осталось: {cards.length}</span>
          </div>
          <div className="draft-pool-items">
            {cards.length === 0 && <span className="draft-pool-empty">разобраны</span>}
            {cards.map(cardId => {
              const card = CARD_DEFS[cardId]
              const affordable = card.cost <= myBudget
              return (
                <button
                  key={cardId}
                  className={`draft-pick-btn card${affordable ? '' : ' unaffordable'}`}
                  style={{ '--accent': card.accent }}
                  disabled={!isMyTurn || !affordable}
                  title={!affordable ? 'Не хватает бюджета' : undefined}
                  onClick={() => onPick({ kind: 'card', cardId })}
                >
                  <span className="draft-pick-glyph">{card.glyph}</span>
                  <span className="draft-pick-label">{card.name}</span>
                  <span className="draft-pick-price">🪙 {card.cost}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <button
        className="draft-pass-btn"
        disabled={!isMyTurn}
        onClick={() => onPick({ kind: 'pass' })}
      >
        Пропустить ход
      </button>

      <div className="draft-rosters">
        <DraftRoster
          label="Вы"
          color={myColor}
          picks={draft.picks[myColor]}
          carried={carryOver?.[myColor]}
          mine
        />
        <DraftRoster
          label="Соперник"
          color={oppColor}
          picks={draft.picks[oppColor]}
          carried={carryOver?.[oppColor]}
        />
      </div>
    </div>
  )
}

// Shows both what survived from the previous round (carried, tagged and
// dimmed so it reads as "already had this") and what's been freshly
// drafted this round — for both yourself AND the opponent, since by the
// draft phase the opponent's carry-over is no longer secret (the round
// that produced it is already over and fully resolved).
function DraftRoster({ label, color, picks, carried, mine }) {
  const carriedPieces = carried?.pieces ?? []
  const carriedCards  = carried?.cards ?? []
  const coins         = carried?.coins ?? 0
  const isEmpty = carriedPieces.length === 0 && carriedCards.length === 0
    && picks.pieces.length === 0 && picks.cards.length === 0

  return (
    <div className={`draft-roster${mine ? ' mine' : ''}`}>
      <div className="draft-roster-header">
        <span className="draft-roster-label">{label}</span>
        {coins > 0 && <span className="draft-roster-coins">🪙 {coins}</span>}
      </div>
      <div className="draft-roster-items">
        {isEmpty && <span className="draft-roster-empty">пока пусто</span>}
        {carriedPieces.map((type, i) => (
          <span
            key={`cp${i}`}
            className="draft-roster-chip carried"
            title={`${PIECE_LABEL[type]} · с прошлого раунда`}
          >
            {PIECE_GLYPHS[color][type]}
          </span>
        ))}
        {picks.pieces.map((type, i) => (
          <span key={`p${i}`} className="draft-roster-chip" title={PIECE_LABEL[type]}>
            {PIECE_GLYPHS[color][type]}
          </span>
        ))}
        {carriedCards.map((cardId, i) => (
          <span
            key={`cc${i}`}
            className="draft-roster-chip card carried"
            style={{ '--accent': CARD_DEFS[cardId].accent }}
            title={`${CARD_DEFS[cardId].name} · с прошлого раунда`}
          >
            {CARD_DEFS[cardId].glyph}
          </span>
        ))}
        {picks.cards.map((cardId, i) => (
          <span
            key={`c${i}`}
            className="draft-roster-chip card"
            style={{ '--accent': CARD_DEFS[cardId].accent }}
            title={CARD_DEFS[cardId].name}
          >
            {CARD_DEFS[cardId].glyph}
          </span>
        ))}
      </div>
    </div>
  )
}
