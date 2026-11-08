// Battle screen (online match, round summary backdrop, sandbox) on the
// shared MatchLayout. All chrome; the board itself is Board.jsx.
import { useState } from 'react'
import { t, tn } from '../i18n'
import MatchLayout from './match/MatchLayout'
import PlayerCard from './match/PlayerCard'
import { BattleJournal } from './match/Journal'
import { CardRow, CardTile, TrayPopover } from './match/Cards'
import CardSplash from './match/CardSplash'
import Board from './Board'
import { Piece } from '../skins/Piece'
import { getCaptured } from '../game/economy'
import { isKingInCheck } from '../game/chess'
import Overlay from './ui/Overlay'
import { IconClose } from './ui/Icons'

const other = c => (c === 'white' ? 'black' : 'white')

export default function GameView({
  phase = 'battle', title, round, boardPattern, names, scores,
  gameState, boardMode, dispatch,
  lastMoveAnim, cardSplash, meteorStrikeAnim, mineStrikeAnim,
  myColor, flipped = false, boardPlayerColor, isMyTurn,
  premove, onSetPremove, onClearPremove,
  onMove, onPlayCard,
  draftLog = [], historyIndex = null, onSelectHistory, onReturnToLive,
  actions, onBack, logButton = true,
  hand, finished = false,
  boardOverlay, children,
  intro = false, // just came from recruit: soft swap of the panels + "Бой!" splash
}) {
  const [logSheet, setLogSheet] = useState(false)
  const [traySel, setTraySel] = useState(null)
  const opp = other(myColor)
  const battleLog = gameState.actionLog ?? []
  const viewingHistory = historyIndex != null && !!battleLog[historyIndex]
  const displayState = viewingHistory ? { ...gameState, ...battleLog[historyIndex].snapshot } : gameState
  const playerColor = viewingHistory ? 'none' : (boardPlayerColor ?? 'none')
  const inCheck = !finished && isKingInCheck(gameState, gameState.turn)

  const clockFor = color => gameState.timers ? {
    seconds: gameState.timers[color],
    startedAt: gameState.turnStartedAt,
    ticking: !finished && gameState.turn === color,
  } : null

  const oppHand = gameState.cards?.[opp]?.hand ?? []
  const oppUsed = gameState.cards?.[opp]?.used ?? []
  const oppCards = [...oppHand.map(c => ({ id: c.id })), ...oppUsed.map(c => ({ id: c.id, used: true }))]
  const myHand = hand?.cards ?? []
  const handActive = !!hand?.isActive && !viewingHistory

  const incomingMeteors = (gameState.meteors ?? []).filter(m => m.hidden)
  const soonestMeteor = incomingMeteors.length ? Math.min(...incomingMeteors.map(m => m.turnsLeft)) : null
  const incomingMines = (gameState.mines ?? []).filter(m => m.hidden)

  const player = (color, side) => (
    <PlayerCard
      side={side}
      color={color}
      name={names[color]}
      active={!finished && gameState.turn === color}
      inCheck={inCheck && gameState.turn === color}
      clock={clockFor(color)}
      score={scores?.[color] ?? 0}
      cards={side === 'opp' ? oppCards : undefined}
      cardsOnDesktop={false}
      captured={getCaptured(gameState, other(color))}
      emptyCardsLabel={t('battle.noCardsShort')}
    />
  )

  const journal = (
    <BattleJournal
      entries={battleLog}
      draftLog={draftLog}
      names={names}
      myColor={myColor}
      turnColor={gameState.turn}
      finished={finished}
      historyIndex={viewingHistory ? historyIndex : null}
      onSelect={onSelectHistory}
      onReturnToLive={onReturnToLive}
    />
  )

  const pickCard = card => {
    setTraySel(null)
    hand?.onCardClick?.(card)
  }
  const armed = boardMode.type === 'card_targeting'

  const threats = (soonestMeteor != null || incomingMines.length > 0) && (
    <div className="bt-threats">
      {soonestMeteor != null && (
        <span className="bt-threat meteor" title={incomingMeteors.length === 1
          ? t('battle.meteorOne', { turns: tn('unit.turns', soonestMeteor) })
          : t('battle.meteorMany', { count: incomingMeteors.length, turns: tn('unit.turns', soonestMeteor) })}>
          <span className="bt-threat-ic">☄</span>{soonestMeteor}
        </span>
      )}
      {incomingMines.length > 0 && (
        <span className="bt-threat mine" title={incomingMines.length === 1 ? t('battle.mineOne') : t('battle.mineMany', { count: incomingMines.length })}>
          <span className="bt-threat-ic">❄</span>{incomingMines.length}
        </span>
      )}
    </div>
  )

  return (
    <MatchLayout
      phase={phase}
      className={intro ? 'intro' : ''}
      title={title}
      round={round}
      boardPattern={boardPattern}
      onBack={onBack}
      actions={(
        <>
          {logButton && (
            <button className="ui-btn icon portrait-only" onClick={() => setLogSheet(true)} aria-label={t('log.title')} title={t('log.title')} data-testid="log-btn">
              <span className="bt-log-ic">≡</span>
            </button>
          )}
          {actions}
        </>
      )}
      opp={player(opp, 'opp')}
      me={player(myColor, 'me')}
      log={journal}
      board={(
        <div className="mx-board-click" style={{ position: 'absolute', inset: 0 }} onClick={e => { if (e.target === e.currentTarget && armed) dispatch({ type: 'CANCEL' }) }}>
          <Board
            gameState={displayState}
            playerColor={playerColor}
            onMove={viewingHistory ? undefined : onMove}
            onPlayCard={viewingHistory ? undefined : onPlayCard}
            boardMode={viewingHistory ? { type: 'idle' } : boardMode}
            dispatch={dispatch}
            lastMoveAnim={viewingHistory ? null : lastMoveAnim}
            meteorStrikeAnim={viewingHistory ? null : meteorStrikeAnim}
            mineStrikeAnim={viewingHistory ? null : mineStrikeAnim}
            isMyTurn={!viewingHistory && isMyTurn}
            premove={viewingHistory ? null : premove}
            onSetPremove={onSetPremove}
            onClearPremove={onClearPremove}
            flipped={flipped}
          />
        </div>
      )}
      boardOverlay={(
        <>
          {threats}
          {viewingHistory && (
            <button className={`ui-btn primary bt-history-back${gameState.turn === myColor && !finished ? ' urgent' : ''}`} onClick={onReturnToLive}>
              {t(gameState.turn === myColor && !finished ? 'log.backMyTurn' : 'log.back')}
            </button>
          )}
          {cardSplash && <CardSplash key={cardSplash.ts} {...cardSplash} />}
          {boardOverlay}
        </>
      )}
      right={(
        <>
          <section className="cd-panel ui-panel" aria-label={t('battle.oppCards', { name: names[opp] })}>
            <div className="cd-panel-head small">
              <span className={`ui-avatar sm ${opp}`}><Piece type="king" color={opp} size={18} center thin /></span>
              {t('battle.oppCards', { name: names[opp] })}
            </div>
            <div className="cd-panel-list">
              {oppCards.length === 0 && <span className="cd-empty">{t('battle.noCardsShort')}</span>}
              {oppCards.map((c, i) => <CardRow key={`${c.id}-${i}`} id={c.id} size="small" used={c.used} />)}
            </div>
          </section>
          <section className="cd-panel ui-panel grow" aria-label={t('battle.yourCards')}>
            <div className="cd-panel-head">
              <span className={`ui-avatar sm ${myColor}`}><Piece type="king" color={myColor} size={18} center thin /></span>
              {t('battle.yourCards')}
            </div>
            <div className="cd-panel-list ui-scroll">
              {myHand.length === 0 && <span className="cd-empty">{t('battle.noCards')}</span>}
              {myHand.map((card, i) => (
                <CardRow
                  key={`${card.id}-${i}`}
                  id={card.id}
                  selected={hand.selectedCardId === card.id}
                  disabled={!handActive}
                  showDesc={hand.selectedCardId === card.id}
                  onClick={() => hand.onCardClick?.(card)}
                />
              ))}
            </div>
          </section>
        </>
      )}
      tray={(
        <>
          {traySel && myHand.some(c => c.id === traySel) && (
            <TrayPopover
              id={traySel}
              actionLabel={t('battle.aim')}
              actionDisabled={!handActive}
              onAction={() => pickCard(myHand.find(c => c.id === traySel))}
              onClose={() => setTraySel(null)}
            />
          )}
          {armed && (
            <div className="bt-armed">
              <span>{t('battle.pickTarget')}</span>
              <button className="ui-btn icon" onClick={() => dispatch({ type: 'CANCEL' })} aria-label={t('battle.cancelCard')}><IconClose /></button>
            </div>
          )}
          <div className="mx-tray-strip">
            {myHand.length === 0 && <span className="mx-tray-empty">{t('battle.noCards')}</span>}
            {myHand.map((card, i) => (
              <CardTile
                key={`${card.id}-${i}`}
                id={card.id}
                selected={hand.selectedCardId === card.id || traySel === card.id}
                disabled={!handActive}
                onClick={() => setTraySel(traySel === card.id ? null : card.id)}
              />
            ))}
          </div>
        </>
      )}
    >
      {logSheet && (
        <Overlay onClose={() => setLogSheet(false)}>
          <div className="ui-modal bt-log-sheet" onClick={e => e.stopPropagation()}>
            <button className="ui-btn icon ui-modal-close" onClick={() => setLogSheet(false)} aria-label={t('common.close')}><IconClose /></button>
            <BattleJournal
              entries={battleLog}
              draftLog={draftLog}
              names={names}
              myColor={myColor}
              turnColor={gameState.turn}
              finished={finished}
              historyIndex={viewingHistory ? historyIndex : null}
              onSelect={i => { onSelectHistory?.(i); setLogSheet(false) }}
              onReturnToLive={() => { onReturnToLive?.(); setLogSheet(false) }}
            />
          </div>
        </Overlay>
      )}
      {children}
    </MatchLayout>
  )
}
