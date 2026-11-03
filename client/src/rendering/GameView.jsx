import { useState } from 'react'
import Board from './Board'
import CardHand from './CardHand'
import Card from './Card'
import SideDrawer from './SideDrawer'
import PlayerPanel from './PlayerPanel'
import MatchScoreBoard from './MatchScoreBoard'
import BattleLog from './BattleLog'

const RESULT_TEXT = {
  checkmate:   r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — мат`,
  king_captured: r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — король соперника взят`,
  elimination: r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — армия соперника уничтожена`,
  timeout:     r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — у соперника закончилось время`,
  no_moves:    r => `${r.winner === 'white' ? 'Белые' : 'Чёрные'} победили — у соперника нет ходов`,
  surrender:   r => `${r.loser === 'white' ? 'Белые' : 'Чёрные'} сдались — ${r.winner === 'white' ? 'белые' : 'чёрные'} победили`,
  stalemate:   ()  => 'Пат — ничья',
  draw:        r   => {
    if (r.reason === '50_move_rule') return 'Ничья — правило 50 ходов'
    if (r.reason === 'mutual_elimination') return 'Ничья — обе армии уничтожены'
    if (r.reason === 'mutual_king') return 'Ничья — оба короля пали'
    if (r.reason === 'agreement') return 'Ничья по соглашению'
    return 'Ничья — недостаточно материала'
  },
}

const RESULT_ICON = { checkmate: '♛', king_captured: '♚', elimination: '♛', timeout: '⏱', no_moves: '🔒', surrender: '🏳' }

// Shared board+panels layout — v2 "stacked" design: opponent's tray pinned
// above the board, yours pinned below (see PlayerPanel.jsx), your
// interactive hand as a vertical rail beside the board instead of a fan
// underneath it. The board itself (Board.jsx) is untouched by this pass —
// it's a whole interactive subsystem (drag/drop, animation, its own tilt),
// this is purely a reskin of the chrome around it.
export default function GameView({
  gameState, boardMode, dispatch, lastMoveAnim, actionToast, meteorStrikeAnim, mineStrikeAnim,
  boardFlipped = false, boardPlayerColor,
  isMyTurn, premove, onSetPremove, onClearPremove,
  turnBar, matchScore,
  topPanel, bottomPanel, bottomHand,
  onMove, onPlayCard,
  gameResult, resultTitle, restartLabel, onRestart,
  // 'modal' (default) — match truly over, nothing left to do but leave;
  // blocks the board behind a backdrop. 'inline' — round over but the
  // match continues (see RoundSummary.jsx): the whole point is to let you
  // calmly inspect the final board/log before moving on, so the result
  // renders as a banner in normal flow instead of covering anything.
  resultMode = 'modal',
  onBackgroundClick,
  battleLog, historyIndex, onSelectHistory, onReturnToLive,
  // Round ← button in the header, before the title — used by the sandbox
  // (its exit used to be a position:fixed button floating ON TOP of the
  // "Бой" title). Online mode doesn't pass it (leaving is surrender/menu).
  onBack,
}) {
  // Closed by default — the log is a reference you check, not something
  // that should cover a fifth of the board the instant a battle starts.
  // Docked left when open (see BattleLog.css's .bl-panel); .bt-log-btn in
  // the header opens/closes it and doubles as the "viewing history"
  // indicator so there's no separate floating banner for that too.
  // Closing goes through a brief `logClosing` beat so the slide-out
  // animation (see BattleLog.css's .bl-panel.closing) actually plays
  // before the panel unmounts, whichever of the two close paths (header
  // toggle or the panel's own ✕) was used.
  const [logOpen, setLogOpen] = useState(false)
  const [logClosing, setLogClosing] = useState(false)
  // Mobile card deck (see SideDrawer) — desktop keeps the always-visible rail.
  const [deckOpen, setDeckOpen] = useState(false)
  function toggleLog() {
    if (!logOpen) { setLogOpen(true); return }
    if (logClosing) return
    setLogClosing(true)
    setTimeout(() => { setLogOpen(false); setLogClosing(false) }, 160)
  }
  const viewingHistory = battleLog && historyIndex != null

  // A pure LOCAL view swap — jumping into history never touches the live
  // match. Only pieces/fogZones/meteors/mines come from the selected
  // snapshot (see chess.js's appendLogEntry); turn/timers/hands/coins stay
  // live, so the clock keeps visibly running while you browse (see
  // BattleLog's "your turn" warning instead of silently pausing it).
  const displayGameState = viewingHistory
    ? { ...gameState, ...battleLog[historyIndex].snapshot }
    : gameState
  const effectivePlayerColor = viewingHistory ? 'none' : (boardPlayerColor ?? 'none')
  const isMyLiveTurn = !gameResult && gameState.turn === bottomPanel?.color
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

  return (
    <div className="bt-screen" onClick={onBackgroundClick}>
      {/* No "Бой" / "ваш ход" caption — you can see it's a battle, and whose
         turn it is shows on the player panels (the glowing ХОДИТ one). The
         header carries only the match score and the functional controls
         (threat status, the journal). */}
      <div className="bt-header">
        <div className="bt-header-left">
          {onBack && <button className="bt-back" onClick={onBack} title="Выйти">←</button>}
          {matchScore && <MatchScoreBoard {...matchScore} />}
        </div>
        <div className="bt-header-right">
          {/* Compact badges, not banners — these used to be full-width
             lines with a permanently reserved slot for whichever was
             tallest, which ate real board height even while empty (most
             of the game) and still needed a jump the one time both fired
             at once. A badge here never changes the header's height at
             all, active or not, so the board never shrinks for it. Full
             wording lives in the title tooltip. */}
          {soonestMeteor != null && (
            <span
              className="threat-badge meteor"
              title={incomingMeteors.length === 1
                ? `Соперник бросил метеор — упадёт через ${soonestMeteor} ${soonestMeteor === 1 ? 'ход' : 'хода'}`
                : `Метеоры соперника (${incomingMeteors.length}) — ближайший упадёт через ${soonestMeteor} ${soonestMeteor === 1 ? 'ход' : 'хода'}`}
            >
              ☄ {soonestMeteor}
            </span>
          )}
          {incomingMines.length > 0 && (
            <span
              className="threat-badge mine"
              title={incomingMines.length === 1
                ? 'Соперник где-то заложил мину заморозки'
                : `Соперник заложил мины заморозки (${incomingMines.length})`}
            >
              ❄{incomingMines.length > 1 ? ` ${incomingMines.length}` : ''}
            </span>
          )}
          {battleLog && (
            <button
              className={`bt-log-btn${logOpen ? ' open' : ''}${viewingHistory ? ' history' : ''}${viewingHistory && isMyLiveTurn ? ' urgent' : ''}`}
              onClick={toggleLog}
            >
              Журнал{viewingHistory ? ` · ход ${historyIndex}` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Floating, not in flow (see .result-inline in App.css) — this only
         ever shows on RoundSummary, never live battle, so if it took flex
         space here .bt-main would get a different amount of room on the
         two screens and the board would visibly be a different size
         between them. Floating keeps the board's own math byte-for-byte
         identical either way. */}
      {gameResult && resultMode === 'inline' && (
        <div className="result-inline">
          <span className="result-icon small">{RESULT_ICON[gameResult.type] ?? '½'}</span>
          <div className="result-inline-text">
            <p className="result-title">{resultTitle ?? RESULT_TEXT[gameResult.type]?.(gameResult)}</p>
            {matchScore && (
              <p className="result-sub">Счёт матча {matchScore.white} : {matchScore.black}</p>
            )}
          </div>
          <button className="restart-btn" onClick={onRestart}>{restartLabel ?? 'Новая игра'}</button>
        </div>
      )}

      <PlayerPanel
        {...topPanel}
        timeSeconds={gameState.timers?.[topPanel.color]}
        turnStartedAt={gameState.turnStartedAt}
        ticking={!gameResult && gameState.turn === topPanel.color}
      />

      <div className="bt-main">
        <span className="bt-main-spacer" />

        <div className="bt-board-col">
          <Board
            fluid
            gameState={displayGameState}
            playerColor={effectivePlayerColor}
            skin="default"
            onMove={viewingHistory ? undefined : onMove}
            onPlayCard={viewingHistory ? undefined : onPlayCard}
            boardMode={boardMode}
            dispatch={dispatch}
            lastMoveAnim={viewingHistory ? null : lastMoveAnim}
            meteorStrikeAnim={viewingHistory ? null : meteorStrikeAnim}
            mineStrikeAnim={viewingHistory ? null : mineStrikeAnim}
            isMyTurn={!viewingHistory && isMyTurn}
            premove={viewingHistory ? null : premove}
            onSetPremove={onSetPremove}
            onClearPremove={onClearPremove}
            flipped={boardFlipped}
          />

          {logOpen && battleLog && (
            <BattleLog
              entries={battleLog}
              historyIndex={historyIndex}
              onSelect={onSelectHistory}
              onReturnToLive={onReturnToLive}
              onClose={toggleLog}
              closing={logClosing}
              isMyLiveTurn={isMyLiveTurn}
            />
          )}

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

        {/* Desktop: always-visible rail beside the board. */}
        <CardHand
          cards={bottomHand.cards}
          isActive={bottomHand.isActive && !viewingHistory}
          selectedCardId={bottomHand.selectedCardId}
          onCardClick={viewingHistory ? undefined : bottomHand.onCardClick}
        />

        {/* Mobile: a slide-out side panel opened from a thin trigger bar, so
           the cards never sit under the board eating its height. */}
        <SideDrawer
          icon="🃠"
          label="Карты"
          count={bottomHand.cards.length}
          title="Твои карты"
          armed={boardMode.type === 'card_targeting'}
          armedLabel="Отменить карту"
          onCancel={() => dispatch({ type: 'CANCEL' })}
          open={deckOpen}
          onOpenChange={setDeckOpen}
          disabled={viewingHistory || !bottomHand.isActive || bottomHand.cards.length === 0}
          emptyText="Карт нет"
        >
          {bottomHand.cards.map((card, i) => (
            <Card
              key={`${card.id}-${i}`}
              card={card}
              selected={bottomHand.selectedCardId === card.id}
              disabled={!bottomHand.isActive || viewingHistory}
              onClick={() => { bottomHand.onCardClick(card); setDeckOpen(false) }}
            />
          ))}
        </SideDrawer>
      </div>

      <PlayerPanel
        {...bottomPanel}
        timeSeconds={gameState.timers?.[bottomPanel.color]}
        turnStartedAt={gameState.turnStartedAt}
        ticking={!gameResult && gameState.turn === bottomPanel.color}
      />

      {gameResult && resultMode === 'modal' && (
        <div className="result-overlay">
          <div className="result-banner">
            <span className="result-icon">{RESULT_ICON[gameResult.type] ?? '½'}</span>
            <p className="result-title">{resultTitle ?? RESULT_TEXT[gameResult.type]?.(gameResult)}</p>
            {matchScore && (
              <p className="result-sub">
                Раунд {matchScore.round} — счёт матча {matchScore.white} : {matchScore.black}
              </p>
            )}
            <button className="restart-btn" onClick={onRestart}>{restartLabel ?? 'Новая игра'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
