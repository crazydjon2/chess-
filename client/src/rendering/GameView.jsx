import Board from './Board'
import CardHand from './CardHand'
import PlayerPanel from './PlayerPanel'
import TurnBar from './TurnBar'
import MatchScoreBoard from './MatchScoreBoard'

const RESULT_TEXT = {
  checkmate:   r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — мат`,
  elimination: r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — армия соперника уничтожена`,
  move_limit:  r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили по материалу — лимит ходов исчерпан`,
  no_moves:    r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили по материалу — у соперника нет ходов`,
  surrender:   r => `${r.loser === 'white' ? 'Белые' : 'Чёрные'} сдались — ${r.winner === 'white' ? 'белые' : 'чёрные'} победили`,
  stalemate:   ()  => 'Пат — ничья',
  draw:        r   => {
    if (r.reason === '50_move_rule') return 'Ничья — правило 50 ходов'
    if (r.reason === 'no_moves') return 'Ничья — нет ходов, материал равен'
    if (r.reason === 'mutual_elimination') return 'Ничья — обе армии уничтожены'
    if (r.reason === 'move_limit') return 'Ничья — лимит ходов, материал равен'
    return 'Ничья — недостаточно материала'
  },
}

const RESULT_ICON = { checkmate: '♛', elimination: '♛', move_limit: '⏱', no_moves: '🔒', surrender: '🏳' }

// Shared board+panels layout. The bottom section always shows a full,
// interactive CardHand (the local viewer's own hand); the top section is a
// PlayerPanel with an embedded HUD hand (opponentCards). The viewer always
// sits at bottom; opponent control is disabled.
export default function GameView({
  gameState, boardMode, dispatch, lastMoveAnim, actionToast, meteorStrikeAnim,
  boardFlipped = false, boardPlayerColor,
  turnBar, matchScore,
  topPanel, bottomPanel, bottomHand,
  onMove, onPlayCard,
  gameResult, resultTitle, resultOutcome, restartLabel, onRestart,
  onBackgroundClick,
}) {
  const movesMade      = gameState.moveHistory?.length ?? 0
  const movesRemaining = gameState.moveLimit ? Math.max(0, gameState.moveLimit - movesMade) : null
  const movesUrgent    = movesRemaining !== null && movesRemaining <= 6

  // Opponent's meteors arrive here with the square stripped (see rooms.js's
  // redactMeteors) — we only ever know THAT one is coming and how long
  // until the soonest lands, never where, so this can only ever be a
  // location-less warning, not a board marker (that's meteorOverlays in
  // VisualLayer.jsx, for the caster's OWN meteors instead).
  const incomingMeteors = (gameState.meteors ?? []).filter(m => m.hidden)
  const soonestMeteor   = incomingMeteors.length > 0 ? Math.min(...incomingMeteors.map(m => m.turnsLeft)) : null

  return (
    <div className="app" onClick={onBackgroundClick}>
      <div className="game-scene" onClick={onBackgroundClick}>

        <div className="player-section">
          <PlayerPanel {...topPanel} />
        </div>

        {matchScore && <MatchScoreBoard {...matchScore} />}

        {movesRemaining !== null && (
          <div className={`moves-timeline${movesUrgent ? ' urgent' : ''}`}>
            <span className="moves-timeline-icon">⏱</span>
            <div className="moves-timeline-track">
              {Array.from({ length: gameState.moveLimit }, (_, i) => (
                <span
                  key={i}
                  className={`moves-tick${i < movesMade ? ' used' : ''}${i === movesMade ? ' current' : ''}`}
                />
              ))}
            </div>
            <span className="moves-timeline-count">{movesRemaining}</span>
          </div>
        )}

        {turnBar && <TurnBar {...turnBar} />}

        {soonestMeteor != null && (
          <div className="meteor-warning">
            <span className="meteor-warning-icon">☄</span>
            {incomingMeteors.length === 1
              ? `Соперник бросил метеор — упадёт через ${soonestMeteor} ${soonestMeteor === 1 ? 'ход' : 'хода'}`
              : `Метеоры соперника (${incomingMeteors.length}) — ближайший упадёт через ${soonestMeteor} ${soonestMeteor === 1 ? 'ход' : 'хода'}`}
          </div>
        )}

        {gameResult && (
          <div className={`result-banner${resultOutcome ? ` result-banner-${resultOutcome}` : ''}`}>
            <span className="result-icon">{RESULT_ICON[gameResult.type] ?? '½'}</span>
            <p className="result-title">{resultTitle ?? RESULT_TEXT[gameResult.type]?.(gameResult)}</p>
            <button className="restart-btn" onClick={onRestart}>{restartLabel ?? 'Новая игра'}</button>
          </div>
        )}

        <div className="board-area">
          <Board
            gameState={gameState}
            playerColor={boardPlayerColor ?? 'none'}
            skin="default"
            onMove={onMove}
            onPlayCard={onPlayCard}
            boardMode={boardMode}
            dispatch={dispatch}
            lastMoveAnim={lastMoveAnim}
            meteorStrikeAnim={meteorStrikeAnim}
            flipped={boardFlipped}
          />

          {actionToast && (
            <div
              key={actionToast.ts}
              className={`action-toast toast-${actionToast.type}`}
              style={{ '--accent': actionToast.card.accent }}
            >
              <span className="toast-glyph">{actionToast.card.glyph}</span>
              <span className="toast-text">
                <b>{actionToast.color === 'white' ? 'Белые' : 'Чёрные'}</b>
                {' сыграли '}
                {actionToast.card.name}
              </span>
            </div>
          )}

        </div>

        <div className="player-section">
          <CardHand
            cards={bottomHand.cards}
            isActive={bottomHand.isActive}
            selectedCardId={bottomHand.selectedCardId}
            onCardClick={bottomHand.onCardClick}
          />
          <PlayerPanel {...bottomPanel} />
        </div>

      </div>
    </div>
  )
}
