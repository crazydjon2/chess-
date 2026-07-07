import { useState, useEffect, useReducer, useCallback } from 'react'
import GameView from './rendering/GameView'
import Lobby from './rendering/Lobby'
import DraftPhase from './rendering/DraftPhase'
import PlacementPhase from './rendering/PlacementPhase'
import RoundSummary from './rendering/RoundSummary'
import PromotionPicker from './rendering/PromotionPicker'
import ConfirmModal from './rendering/ConfirmModal'
import { getSocket, connectSocket, disconnectSocket, request } from './net/socket'
import { loadNickname, saveNickname } from './nickname'
import { getValidTargets, CARD_DEFS } from './game/cards'
import { isKingInCheck, needsPromotion } from './game/chess'
import { boardModeReducer, IDLE } from './game/boardMode'
import { getCaptured } from './game/economy'

const other = color => (color === 'white' ? 'black' : 'white')

// Real multiplayer over Socket.IO — the draft-match game mode: draft ->
// hidden placement -> battle -> round result -> next round, best of 3.
// The server is fully authoritative; this component just renders whatever
// `match` phase the last `match_update` broadcast said we're in and sends
// requests (draft_pick / submit_placement / move / play_card).
export default function OnlineApp({ onExit }) {
  const [phase, setPhase]       = useState('menu') // 'menu' | 'waiting' | 'match'
  const [busy, setBusy]         = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [room, setRoom]         = useState(null)   // { code, color, players }
  const [match, setMatch]       = useState(null)   // per-color redacted match view
  const [opponentLeft, setOpponentLeft] = useState(false)

  const [boardMode, dispatch]           = useReducer(boardModeReducer, IDLE)
  const [lastMoveAnim, setLastMoveAnim] = useState(null)
  const [actionToast, setActionToast]   = useState(null)
  const [meteorStrikeAnim, setMeteorStrikeAnim] = useState(null) // { strikes: [{square, destroyed}], ts }
  const [summarySeenFor, setSummarySeenFor] = useState(null) // last previousRound whose summary was dismissed
  const [pendingPromotion, setPendingPromotion] = useState(null) // { from, to } awaiting a piece choice
  const [surrenderConfirm, setSurrenderConfirm] = useState(false)
  const [nickname, setNickname] = useState(loadNickname)

  function handleNicknameChange(name) {
    setNickname(name)
    saveNickname(name)
  }

  const flashError = useCallback((msg) => {
    setErrorMsg(msg)
    setTimeout(() => setErrorMsg(null), 3000)
  }, [])

  useEffect(() => {
    const socket = connectSocket()

    socket.on('room_update', (data) => setRoom(prev => (prev ? { ...prev, ...data } : prev)))

    socket.on('match_update', ({ match: m, lastAction, meteorStrikes, ...roomInfo }) => {
      setRoom(prev => (prev ? { ...prev, ...roomInfo } : prev))
      setMatch(m)
      dispatch({ type: 'CANCEL' })
      // `hidden: true` means the server redacted the card id/piece type
      // because it happened inside the actor's own active fog zone (see
      // rooms.js's redactLastAction) — nothing to show this viewer.
      if (lastAction && !lastAction.hidden) {
        if (['move', 'capture', 'bounce'].includes(lastAction.type)) {
          setLastMoveAnim({ type: lastAction.type, from: lastAction.from, to: lastAction.to, ts: Date.now() })
        } else if (lastAction.type === 'card') {
          const card = CARD_DEFS[lastAction.cardId]
          setActionToast({ type: 'card', color: lastAction.color, card, ts: Date.now() })
          setTimeout(() => setActionToast(null), 2000)
        }
      }
      // Meteor impacts are never secret (unlike the target square while
      // still in flight) — both players see the same explosion, at the
      // same square, the moment it lands.
      if (meteorStrikes && meteorStrikes.length > 0) {
        setMeteorStrikeAnim({ strikes: meteorStrikes, ts: Date.now() })
        setTimeout(() => setMeteorStrikeAnim(null), 900)
      }
      setPhase('match')
    })

    socket.on('opponent_left', () => setOpponentLeft(true))
    socket.on('game_error', ({ message }) => flashError(message))
    socket.on('connect_error', () => flashError('Не удалось подключиться к серверу'))

    return () => {
      socket.off('room_update')
      socket.off('match_update')
      socket.off('opponent_left')
      socket.off('game_error')
      socket.off('connect_error')
      disconnectSocket()
    }
  }, [flashError])

  async function handleCreate(color) {
    setBusy(true)
    try {
      const res = await request('create_room', { color, name: nickname })
      setRoom({ code: res.code, color: res.color, players: res.players })
      setPhase('waiting')
    } catch (e) {
      flashError(e.message)
    }
    setBusy(false)
  }

  async function handleJoin(code) {
    setBusy(true)
    try {
      const res = await request('join_room', { code, name: nickname })
      setRoom({ code, color: res.color, players: res.players })
      setPhase('waiting')
    } catch (e) {
      flashError(e.message)
    }
    setBusy(false)
  }

  function handleLeave() {
    getSocket().emit('leave_room')
    setPhase('menu')
    setRoom(null)
    setMatch(null)
    setOpponentLeft(false)
    setActionToast(null)
    setLastMoveAnim(null)
    setMeteorStrikeAnim(null)
    setSummarySeenFor(null)
    setPendingPromotion(null)
    setSurrenderConfirm(false)
    dispatch({ type: 'CANCEL' })
  }

  // ── Menu / waiting for the second seat — no match yet ─────────────
  if (phase !== 'match' || !room || !match) {
    return (
      <Lobby
        phase={phase === 'menu' ? 'menu' : 'waiting'}
        room={room}
        busy={busy}
        errorMsg={errorMsg}
        onCreate={handleCreate}
        onJoin={handleJoin}
        onLeave={handleLeave}
        nickname={nickname}
        onNicknameChange={handleNicknameChange}
      />
    )
  }

  const myColor  = room.color
  const oppColor = other(myColor)

  // ── Round-over summary (own + opponent's carry-over) ───────────────
  // Shown once per round transition, right before the next round's draft —
  // the server already computed carryOver for both sides when it ended the
  // previous round, so this is just surfacing data that already exists.
  if (match.phase === 'draft' && match.previousRound != null && summarySeenFor !== match.previousRound) {
    return (
      <RoundSummary
        match={match}
        myColor={myColor}
        oppColor={oppColor}
        // Colors swap every round (see matchEngine.js) — during the round
        // that just ended, "my" pieces were whatever color I'm NOT playing
        // now, so the frozen board must be oriented/labeled accordingly.
        previousMyColor={oppColor}
        onContinue={() => setSummarySeenFor(match.previousRound)}
      />
    )
  }

  // ── Draft phase (visible, alternating picks) ──────────────────────
  if (match.phase === 'draft') {
    return (
      <DraftPhase
        round={match.round}
        boardPattern={match.boardPattern}
        draft={match.draft}
        carryOver={match.carryOver}
        myColor={myColor}
        onPick={(choice) => getSocket().emit('draft_pick', choice)}
      />
    )
  }

  // ── Placement phase (hidden from opponent) ─────────────────────────
  if (match.phase === 'placement') {
    return (
      <PlacementPhase
        boardPattern={match.boardPattern}
        draftedPieces={match.draft.picks[myColor].pieces}
        carryOverPieces={match.carryOver?.[myColor]?.pieces ?? []}
        myColor={myColor}
        opponentReady={match.placement[oppColor].ready}
        oppColor={oppColor}
        oppPieces={[...(match.carryOver?.[oppColor]?.pieces ?? []), ...match.draft.picks[oppColor].pieces]}
        oppCards={[...(match.carryOver?.[oppColor]?.cards ?? []), ...match.draft.picks[oppColor].cards]}
        onSubmit={(map) => getSocket().emit('submit_placement', { map })}
      />
    )
  }

  // ── Battle / match-over — reuse the normal GameView battle UI ──────
  const gameState    = match.gameState
  const matchOver     = match.phase === 'match_over'
  const myTurn        = !matchOver && gameState.turn === myColor
  const inCheck        = match.phase === 'battle' && !gameState.eliminationMode && isKingInCheck(gameState, gameState.turn)
  // Cards no longer end the turn — you still get your normal move/purchase
  // this turn, just capped at one card played per turn.
  const cardsLocked   = myTurn && gameState.cardPlayedThisTurn

  const myCaptured  = getCaptured(gameState, myColor)
  const oppCaptured = getCaptured(gameState, oppColor)

  function handleMove({ from, to }) {
    if (match.phase !== 'battle' || !myTurn) return
    if (needsPromotion(gameState, from, to)) {
      setPendingPromotion({ from, to })
      return
    }
    getSocket().emit('move', { from, to })
  }

  function handlePromotionPick(promotion) {
    if (!pendingPromotion) return
    getSocket().emit('move', { ...pendingPromotion, promotion })
    setPendingPromotion(null)
  }

  function handlePromotionCancel() {
    setPendingPromotion(null)
  }

  function handleSurrenderConfirm() {
    getSocket().emit('surrender')
    setSurrenderConfirm(false)
  }

  function handleCardSelect(card) {
    if (match.phase !== 'battle' || !myTurn || cardsLocked) return
    if (boardMode.type === 'card_targeting' && boardMode.card.id === card.id) {
      dispatch({ type: 'CANCEL' })
      return
    }
    const validTargets = getValidTargets(card.id, gameState, myColor)
    dispatch({ type: 'PLAY_CARD', card, validTargets })
  }

  function handlePlayCard({ card, target }) {
    if (match.phase !== 'battle' || !myTurn || cardsLocked) return
    getSocket().emit('play_card', { cardId: card.id, target })
  }

  function handleBackgroundClick(e) {
    if (e.target === e.currentTarget && boardMode.type === 'card_targeting') {
      dispatch({ type: 'CANCEL' })
    }
  }

  const gameResult   = matchOver ? match.lastRoundResult : null
  const matchOutcome = matchOver
    ? (match.scores[myColor] > match.scores[oppColor] ? 'win' : 'loss')
    : undefined
  const resultTitle = matchOver
    ? `Матч окончен — ${matchOutcome === 'win' ? 'вы победили' : 'вы проиграли'} ${match.scores.white}:${match.scores.black}`
    : undefined

  return (
    <>
      {opponentLeft && (
        <div className="opponent-left-banner">
          Соперник покинул игру
          <button onClick={handleLeave}>Выйти в меню</button>
        </div>
      )}
      {pendingPromotion && (
        <PromotionPicker
          color={myColor}
          onPick={handlePromotionPick}
          onCancel={handlePromotionCancel}
        />
      )}
      {surrenderConfirm && (
        <ConfirmModal
          title="Сдаться?"
          message="Вы проиграете этот раунд сопернику. Все ваши фигуры, карты и монеты сохранятся и перейдут в следующий раунд."
          confirmLabel="Сдаться"
          onConfirm={handleSurrenderConfirm}
          onCancel={() => setSurrenderConfirm(false)}
        />
      )}
      <GameView
        gameState={gameState}
        boardMode={boardMode}
        dispatch={dispatch}
        lastMoveAnim={lastMoveAnim}
        actionToast={actionToast}
        meteorStrikeAnim={meteorStrikeAnim}
        boardFlipped={myColor === 'black'}
        boardPlayerColor={myTurn ? myColor : 'none'}
        onMove={handleMove}
        onPlayCard={handlePlayCard}
        gameResult={gameResult}
        resultTitle={resultTitle}
        resultOutcome={matchOutcome}
        restartLabel={matchOver ? 'В меню' : undefined}
        onRestart={handleLeave}
        onBackgroundClick={handleBackgroundClick}
        matchScore={{
          round: match.round,
          white: match.scores.white,
          black: match.scores.black,
          whiteName: room.players?.white?.name,
          blackName: room.players?.black?.name,
        }}
        turnBar={!matchOver ? {
          color: gameState.turn,
          text: gameState.turn === 'white' ? 'Ход белых' : 'Ход чёрных',
          sub: myTurn ? 'Ваш ход' : 'Ход соперника',
          urgent: myTurn,
        } : null}
        topPanel={{
          color: oppColor,
          name: room.players?.[oppColor]?.name,
          capturedByMe: oppCaptured,
          active: gameState.turn === oppColor,
          inCheck: inCheck && gameState.turn === oppColor,
          opponentCards: gameState.cards[oppColor].hand,
          selectedCardId: null,
          onCardClick: undefined,
          coins: gameState.coins[oppColor],
          controllable: false,
        }}
        bottomPanel={{
          color: myColor,
          name: room.players?.[myColor]?.name,
          capturedByMe: myCaptured,
          active: myTurn,
          inCheck: inCheck && myTurn,
          isYou: true,
          coins: gameState.coins[myColor],
          onSurrender: !matchOver ? () => setSurrenderConfirm(true) : undefined,
          controllable: myTurn,
        }}
        bottomHand={{
          cards: gameState.cards[myColor].hand,
          isActive: myTurn && !cardsLocked,
          selectedCardId: boardMode.type === 'card_targeting' ? boardMode.card.id : null,
          onCardClick: handleCardSelect,
        }}
      />
    </>
  )
}
