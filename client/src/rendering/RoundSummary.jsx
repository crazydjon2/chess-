import { t, playerName } from '../i18n'
import { useEffect, useState } from 'react'
import GameView from './GameView'
import { IDLE } from '../game/boardMode'
import { getCaptured } from '../game/economy'
import { play } from '../sound'

function resultLine(result) {
  if (!result) return ''
  const winnerLabel = t(result.winner === 'white' ? 'common.white' : 'common.black')
  switch (result.type) {
    case 'king_captured': return t('summary.kingCaptured', { winner: winnerLabel })
    case 'elimination': return t('summary.elimination', { winner: winnerLabel })
    case 'checkmate':    return t('summary.checkmate', { winner: winnerLabel })
    case 'timeout':      return t('summary.timeout', { winner: winnerLabel })
    case 'no_moves':     return t('summary.noMoves', { winner: winnerLabel })
    case 'surrender':    return t('summary.surrender', { loser: t(result.loser === 'white' ? 'common.white' : 'common.black'), winner: winnerLabel })
    case 'draw':
      if (result.reason === 'mutual_elimination') return t('summary.mutualElim')
      if (result.reason === 'mutual_king') return t('summary.mutualKing')
      if (result.reason === 'agreement') return t('summary.agreement')
      return t('summary.draw')
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
  const outcomeLabel = { win: t('summary.win'), loss: t('summary.loss'), draw: t('summary.draw') }[outcome]
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
      restartLabel={t('summary.continue', { n: match.round })}
      onRestart={onContinue}
      matchScore={{
        round: match.previousRound,
        white: match.scores.white,
        black: match.scores.black,
        whiteName: playerName(room?.players?.white),
        blackName: playerName(room?.players?.black),
      }}
      topPanel={{
        color: oppColor,
        name: playerName(room?.players?.[oppColor]),
        capturedByMe: oppCaptured,
        active: false,
        controllable: false,
      }}
      bottomPanel={{
        color: previousMyColor,
        name: playerName(room?.players?.[previousMyColor]),
        capturedByMe: myCaptured,
        active: false,
        isYou: true,
        controllable: false,
      }}
      bottomHand={{ cards: [], isActive: false, selectedCardId: null, onCardClick: undefined }}
    />
  )
}
