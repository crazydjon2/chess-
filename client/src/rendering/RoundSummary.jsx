import { useEffect, useState } from 'react'
import GameView from './GameView'
import { IDLE } from '../game/boardMode'
import { getCaptured } from '../game/economy'
import { play } from '../sound'

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

// win/loss/draw from the viewer's own perspective — just picks which
// RESULT_ICON/headline reads right; GameView's own outcome-agnostic
// styling handles the rest.
function outcomeFor(result, viewerColor) {
  if (!result) return 'draw'
  if (result.type === 'draw') return 'draw'
  return result.winner === viewerColor ? 'win' : 'loss'
}

// Reuses GameView wholesale (resultMode="inline") instead of a separate
// bespoke layout — the whole point is that this screen should look and
// sit exactly like the battle screen it follows (same trays, same board
// position/size, same battle log), just frozen on the round's final
// position with a non-blocking "who/how/why won" banner instead of being
// interactive. See GameView.jsx's resultMode prop.
export default function RoundSummary({ match, previousMyColor, room, onContinue }) {
  const [historyIndex, setHistoryIndex] = useState(null)

  const result  = match.lastRoundResult
  const outcome = outcomeFor(result, previousMyColor)

  // One jingle as the result banner lands — ascending for a win, two soft
  // falling notes for a loss (see sound.js). Keyed on previousRound so it
  // can't replay on re-renders within the same summary.
  useEffect(() => {
    if (outcome === 'win') play('win')
    else if (outcome === 'loss') play('lose')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.previousRound])
  const outcomeLabel = { win: 'Вы победили в раунде', loss: 'Вы проиграли раунд', draw: 'Ничья' }[outcome]
  const line = resultLine(result)

  const gameState = match.previousGameState
  if (!gameState) return null

  const oppColor = previousMyColor === 'white' ? 'black' : 'white'
  const myCaptured  = getCaptured(gameState, previousMyColor)
  const oppCaptured = getCaptured(gameState, oppColor)

  return (
    <GameView
      gameState={gameState}
      boardMode={IDLE}
      dispatch={() => {}}
      boardFlipped={previousMyColor === 'black'}
      boardPlayerColor="none"
      battleLog={gameState.actionLog}
      historyIndex={historyIndex}
      onSelectHistory={setHistoryIndex}
      onReturnToLive={() => setHistoryIndex(null)}
      gameResult={result}
      resultMode="inline"
      resultTitle={`${outcomeLabel}${line ? ' — ' + line : ''}`}
      restartLabel={`Продолжить → Раунд ${match.round}`}
      onRestart={onContinue}
      matchScore={{
        round: match.previousRound,
        white: match.scores.white,
        black: match.scores.black,
        whiteName: room?.players?.white?.name,
        blackName: room?.players?.black?.name,
      }}
      topPanel={{
        color: oppColor,
        name: room?.players?.[oppColor]?.name,
        capturedByMe: oppCaptured,
        active: false,
        coins: gameState.coins?.[oppColor],
        controllable: false,
      }}
      bottomPanel={{
        color: previousMyColor,
        name: room?.players?.[previousMyColor]?.name,
        capturedByMe: myCaptured,
        active: false,
        isYou: true,
        coins: gameState.coins?.[previousMyColor],
        controllable: false,
      }}
      bottomHand={{ cards: [], isActive: false, selectedCardId: null, onCardClick: undefined }}
    />
  )
}
