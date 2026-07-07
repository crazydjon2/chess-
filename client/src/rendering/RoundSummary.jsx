import Board from './Board'
import { IDLE } from '../game/boardMode'
import { CARD_DEFS } from '../game/cards'
import { PIECE_GLYPHS, PIECE_LABEL } from '../game/economy'
import './RoundSummary.css'

const RESULT_ICON = { checkmate: '♛', elimination: '♛', move_limit: '⏱', no_moves: '🔒', surrender: '🏳', draw: '½' }

function resultLine(result) {
  if (!result) return ''
  const winnerLabel = result.winner === 'white' ? 'Белые' : 'Чёрные'
  switch (result.type) {
    case 'elimination': return `${winnerLabel} уничтожили армию соперника`
    case 'checkmate':    return `${winnerLabel} поставили мат`
    case 'move_limit':   return `${winnerLabel} победили по материалу — закончился лимит ходов`
    case 'no_moves':     return `${winnerLabel} победили по материалу — у соперника не осталось ходов`
    case 'surrender':    return `${result.loser === 'white' ? 'Белые' : 'Чёрные'} сдались — ${winnerLabel} победили`
    case 'draw':
      if (result.reason === 'mutual_elimination') return 'Обе армии уничтожены — ничья'
      if (result.reason === 'no_moves') return 'Нет ходов, материал равен — ничья'
      if (result.reason === 'move_limit') return 'Лимит ходов, материал равен — ничья'
      return 'Ничья'
    default: return ''
  }
}

// win/loss/draw from the viewer's own perspective — drives the banner's
// color-coding so "did I just win or lose that round" reads instantly,
// without having to parse the result text.
function outcomeFor(result, viewerColor) {
  if (!result) return 'draw'
  if (result.type === 'draw') return 'draw'
  return result.winner === viewerColor ? 'win' : 'loss'
}

// What each side is taking into the next round — revealed in full now that
// the round is actually over, including the opponent's side (previously
// only visible piece-by-piece as it survived on the board; here it's the
// full picture: surviving pieces, unused cards, and banked coins).
function Roster({ label, army }) {
  return (
    <div className="rs-roster">
      <div className="rs-roster-label">{label}</div>
      <div className="rs-roster-row">
        {army.pieces.length === 0
          ? <span className="rs-empty">нет фигур</span>
          : army.pieces.map((type, i) => (
              <span key={i} className="rs-chip piece" title={PIECE_LABEL[type]}>
                {PIECE_GLYPHS.white[type]}
              </span>
            ))}
      </div>
      <div className="rs-roster-row">
        {army.cards.length === 0
          ? <span className="rs-empty">нет карт</span>
          : army.cards.map((cardId, i) => (
              <span key={i} className="rs-chip card" style={{ '--accent': CARD_DEFS[cardId].accent }} title={CARD_DEFS[cardId].name}>
                {CARD_DEFS[cardId].glyph}
              </span>
            ))}
      </div>
      <div className="rs-roster-coins">🪙 {army.coins}</div>
    </div>
  )
}

export default function RoundSummary({ match, myColor, oppColor, previousMyColor, onContinue }) {
  const result  = match.lastRoundResult
  const outcome = outcomeFor(result, previousMyColor)
  const outcomeLabel = { win: 'Вы победили в раунде', loss: 'Вы проиграли раунд', draw: 'Ничья' }[outcome]

  return (
    <div className="rs-screen">
      <div className="rs-card">
        <div className={`rs-banner rs-banner-${outcome}`}>
          <span className="rs-banner-icon">{RESULT_ICON[result?.type] ?? '½'}</span>
          <div className="rs-banner-text">
            <div className="rs-banner-headline">{outcomeLabel}</div>
            <div className="rs-banner-sub">{resultLine(result)}</div>
          </div>
        </div>

        <div className="rs-meta">
          <span>Раунд {match.previousRound} завершён</span>
          <span className="rs-score">Счёт матча {match.scores.white}&nbsp;:&nbsp;{match.scores.black}</span>
        </div>

        {match.previousGameState && (
          <div className="rs-board-wrap">
            <div className="rs-board-label">Как закончился раунд</div>
            <Board
              gameState={match.previousGameState}
              playerColor="none"
              boardMode={IDLE}
              dispatch={() => {}}
              flipped={previousMyColor === 'black'}
            />
          </div>
        )}

        <div className="rs-rosters">
          <Roster label="У вас в следующем раунде" army={match.carryOver[myColor]} />
          <Roster label="У соперника в следующем раунде" army={match.carryOver[oppColor]} />
        </div>

        <button className="rs-continue-btn" onClick={onContinue}>Продолжить → Раунд {match.round}</button>
      </div>
    </div>
  )
}
