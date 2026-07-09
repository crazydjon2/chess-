import Board from './Board'
import { IDLE } from '../game/boardMode'
import './RoundSummary.css'

const RESULT_ICON = { checkmate: '♛', elimination: '♛', timeout: '⏱', no_moves: '🔒', surrender: '🏳', draw: '½' }

function resultLine(result) {
  if (!result) return ''
  const winnerLabel = result.winner === 'white' ? 'Белые' : 'Чёрные'
  switch (result.type) {
    case 'elimination': return `${winnerLabel} уничтожили армию соперника`
    case 'checkmate':    return `${winnerLabel} поставили мат`
    case 'timeout':      return `${winnerLabel} победили — у соперника закончилось время`
    case 'no_moves':     return `${winnerLabel} победили — у соперника не осталось ходов`
    case 'surrender':    return `${result.loser === 'white' ? 'Белые' : 'Чёрные'} сдались — ${winnerLabel} победили`
    case 'draw':
      if (result.reason === 'mutual_elimination') return 'Обе армии уничтожены — ничья'
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

export default function RoundSummary({ match, previousMyColor, onContinue }) {
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

        <button className="rs-continue-btn" onClick={onContinue}>Продолжить → Раунд {match.round}</button>
      </div>
    </div>
  )
}
