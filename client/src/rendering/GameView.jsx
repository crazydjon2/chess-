import Board from './Board'
import CardHand from './CardHand'
import PlayerPanel from './PlayerPanel'
import TurnBar from './TurnBar'
import MatchScoreBoard from './MatchScoreBoard'
import AnalysisBanner from './AnalysisBanner'

const RESULT_TEXT = {
  checkmate:   r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — мат`,
  elimination: r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — армия соперника уничтожена`,
  timeout:     r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — у соперника закончилось время`,
  no_moves:    r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — у соперника нет ходов`,
  surrender:   r => `${r.loser === 'white' ? 'Белые' : 'Чёрные'} сдались — ${r.winner === 'white' ? 'белые' : 'чёрные'} победили`,
  stalemate:   ()  => 'Пат — ничья',
  draw:        r   => {
    if (r.reason === '50_move_rule') return 'Ничья — правило 50 ходов'
    if (r.reason === 'mutual_elimination') return 'Ничья — обе армии уничтожены'
    return 'Ничья — недостаточно материала'
  },
}

const RESULT_ICON = { checkmate: '♛', elimination: '♛', timeout: '⏱', no_moves: '🔒', surrender: '🏳' }

// Shared board+panels layout. The bottom section always shows a full,
// interactive CardHand (the local viewer's own hand); the top section is a
// PlayerPanel with an embedded HUD hand (opponentCards). The viewer always
// sits at bottom; opponent control is disabled.
export default function GameView({
  gameState, boardMode, dispatch, lastMoveAnim, actionToast, meteorStrikeAnim, mineStrikeAnim,
  boardFlipped = false, boardPlayerColor,
  isMyTurn, premove, onSetPremove, onClearPremove,
  turnBar, matchScore,
  topPanel, bottomPanel, bottomHand,
  onMove, onPlayCard,
  gameResult, resultTitle, resultOutcome, restartLabel, onRestart,
  onBackgroundClick,
}) {
  // Opponent's meteors arrive here with the square stripped (see rooms.js's
  // redactMeteors) — we only ever know THAT one is coming and how long
  // until the soonest lands, never where, so this can only ever be a
  // location-less warning, not a board marker (that's meteorOverlays in
  // VisualLayer.jsx, for the caster's OWN meteors instead).
  const incomingMeteors = (gameState.meteors ?? []).filter(m => m.hidden)
  const soonestMeteor   = incomingMeteors.length > 0 ? Math.min(...incomingMeteors.map(m => m.turnsLeft)) : null

  // Opponent's mines arrive here with the square stripped too (see rooms.js's
  // redactMines) — same location-less-warning treatment as meteors, just no
  // countdown (a mine has no timer, it's armed until someone steps on it).
  const incomingMines = (gameState.mines ?? []).filter(m => m.hidden)

  const hasAnalysisLeft = (color) => gameState.analysisUsed ? !gameState.analysisUsed[color] : false

  return (
    <div className="app" onClick={onBackgroundClick}>
      <div className="game-scene" onClick={onBackgroundClick}>

        <div className="player-section">
          <PlayerPanel
            {...topPanel}
            timeSeconds={gameState.timers?.[topPanel.color]}
            turnStartedAt={gameState.turnStartedAt}
            ticking={!gameResult && gameState.turn === topPanel.color}
            analysisSeconds={gameState.analysisSeconds}
            hasAnalysisLeft={hasAnalysisLeft(topPanel.color)}
          />
        </div>

        {matchScore && <MatchScoreBoard {...matchScore} />}

        {turnBar && <TurnBar {...turnBar} />}

        <AnalysisBanner
          turnStartedAt={gameState.turnStartedAt}
          analysisSeconds={gameState.analysisSeconds}
          hasAnalysisLeft={hasAnalysisLeft(gameState.turn)}
        />

        {soonestMeteor != null && (
          <div className="meteor-warning">
            <span className="meteor-warning-icon">☄</span>
            {incomingMeteors.length === 1
              ? `Соперник бросил метеор — упадёт через ${soonestMeteor} ${soonestMeteor === 1 ? 'ход' : 'хода'}`
              : `Метеоры соперника (${incomingMeteors.length}) — ближайший упадёт через ${soonestMeteor} ${soonestMeteor === 1 ? 'ход' : 'хода'}`}
          </div>
        )}

        {incomingMines.length > 0 && (
          <div className="mine-warning">
            <span className="mine-warning-icon">❄</span>
            {incomingMines.length === 1
              ? 'Соперник где-то заложил мину заморозки'
              : `Соперник заложил мины заморозки (${incomingMines.length})`}
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
            mineStrikeAnim={mineStrikeAnim}
            isMyTurn={isMyTurn}
            premove={premove}
            onSetPremove={onSetPremove}
            onClearPremove={onClearPremove}
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
          <PlayerPanel
            {...bottomPanel}
            timeSeconds={gameState.timers?.[bottomPanel.color]}
            turnStartedAt={gameState.turnStartedAt}
            ticking={!gameResult && gameState.turn === bottomPanel.color}
            analysisSeconds={gameState.analysisSeconds}
            hasAnalysisLeft={hasAnalysisLeft(bottomPanel.color)}
          />
        </div>

      </div>
    </div>
  )
}
