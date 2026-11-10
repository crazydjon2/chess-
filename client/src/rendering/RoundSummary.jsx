import { t, playerName } from '../i18n'
import { useEffect, useState } from 'react'
import GameView from './GameView'
import ResultModal from './match/ResultModal'
import { IDLE } from '../game/boardMode'
import { play } from '../sound'

export function resultLine(result) {
  if (!result) return ''
  const winnerLabel = t(result.winner === 'white' ? 'common.white' : 'common.black')
  switch (result.type) {
    case 'king_captured': return t('summary.kingCaptured', { winner: winnerLabel })
    case 'elimination': return t('summary.elimination', { winner: winnerLabel })
    case 'checkmate': return t('summary.checkmate', { winner: winnerLabel })
    case 'timeout': return t('summary.timeout', { winner: winnerLabel })
    case 'no_moves': return t('summary.noMoves', { winner: winnerLabel })
    case 'surrender': return t('summary.surrender', { loser: t(result.loser === 'white' ? 'common.white' : 'common.black'), winner: winnerLabel })
    case 'draw':
      if (result.reason === 'mutual_elimination') return t('summary.mutualElim')
      if (result.reason === 'mutual_king') return t('summary.mutualKing')
      if (result.reason === 'agreement') return t('summary.agreement')
      return t('summary.draw')
    default: return ''
  }
}

export function outcomeFor(result, viewerColor) {
  if (!result || result.type === 'draw' || result.type === 'stalemate') return 'draw'
  return result.winner === viewerColor ? 'win' : 'loss'
}

// Between rounds: the finished round's final board (frozen, journal still
// browsable) with the result on top. "Next round" — or the server's cap —
// starts the next recruit (see matchEngine.js's trySummaryContinue).
export default function RoundSummary({ match, previousMyColor, room, onContinue, onExit }) {
  const [historyIndex, setHistoryIndex] = useState(null)
  const [hidden, setHidden] = useState(false)
  // Fixed once: re-deriving it on every update (e.g. the opponent pressing
  // "continue") changed the bar's animation-duration mid-run → it jumped.
  const [countdownMs] = useState(() => (match.summaryDeadline ? Math.max(0, match.summaryDeadline - Date.now()) : 0))
  const result = match.lastRoundResult
  const outcome = outcomeFor(result, previousMyColor)

  useEffect(() => {
    if (outcome === 'win') play('win')
    else if (outcome === 'loss') play('lose')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.previousRound])

  const gameState = match.previousGameState
  if (!gameState) return null
  const oppColor = previousMyColor === 'white' ? 'black' : 'white'
  // Scores were swapped to the NEXT round's colors (see applyRoundResult):
  // this viewer now holds oppColor, so their score sits under oppColor.
  const myScore = match.scores[oppColor]
  const theirScore = match.scores[previousMyColor]
  const names = {
    // players were swapped too — the person who was previousMyColor is now oppColor
    [previousMyColor]: playerName(room?.players?.[oppColor]) || t('common.you'),
    [oppColor]: playerName(room?.players?.[previousMyColor]) || t('common.opponent'),
  }
  const title = outcome === 'draw' ? t('summary.drawTitle') : t('summary.roundN', { n: match.previousRound })

  return (
    <GameView
      onBack={onExit}
      round={match.previousRound}
      boardPattern={match.previousBoardPattern}
      names={names}
      scores={{ [previousMyColor]: myScore, [oppColor]: theirScore }}
      gameState={gameState}
      boardMode={IDLE}
      dispatch={() => {}}
      myColor={previousMyColor}
      flipped={previousMyColor === 'black'}
      boardPlayerColor="none"
      finished
      historyIndex={historyIndex}
      onSelectHistory={i => { setHistoryIndex(i); setHidden(true) }}
      onReturnToLive={() => setHistoryIndex(null)}
      hand={{ cards: [], isActive: false }}
      actions={hidden ? <button className="ui-btn primary keep-lbl" onClick={() => setHidden(false)}><span className="lbl">{t('summary.showResult')}</span></button> : null}
    >
      {!hidden && (
        <ResultModal
          title={title}
          reason={resultLine(result)}
          outcome={outcome}
          me={{ color: previousMyColor, name: names[previousMyColor], score: myScore }}
          opp={{ color: oppColor, name: names[oppColor], score: theirScore }}
          secondary={{ label: t('summary.toBoard'), onClick: () => setHidden(true) }}
          primary={{ label: t('summary.nextRound'), onClick: onContinue, countdownMs }}
        />
      )}
    </GameView>
  )
}
