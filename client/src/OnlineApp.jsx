import { useState, useEffect, useReducer, useCallback, useRef } from 'react'
import { useMatch, useNavigate } from 'react-router'
import GameView from './rendering/GameView'
import Lobby from './rendering/Lobby'
import DraftPhase from './rendering/DraftPhase'
import PlacementPhase from './rendering/PlacementPhase'
import RoundSummary from './rendering/RoundSummary'
import PromotionPicker from './rendering/PromotionPicker'
import ConfirmModal from './rendering/ConfirmModal'
import PageTransition from './rendering/PageTransition'
import { getSocket, connectSocket, disconnectSocket, request } from './net/socket'
import { saveSeat, loadSeatToken, clearSeat } from './net/seat'
import { loadNickname, saveNickname } from './nickname'
import { getValidTargets, CARD_DEFS } from './game/cards'
import { isKingInCheck, needsPromotion } from './game/chess'
import { boardModeReducer, IDLE } from './game/boardMode'
import { getCaptured } from './game/economy'
import { PLACEMENT_TIME_BY_ROUND } from './game/draftPools'
import { play } from './sound'

const other = color => (color === 'white' ? 'black' : 'white')

// Real multiplayer over Socket.IO — the draft-match game mode: draft ->
// open placement -> battle -> round result -> next round, best of 3.
// The server is fully authoritative; this component just renders whatever
// `match` phase the last `match_update` broadcast said we're in and sends
// requests (draft_pick / draft_done / submit_placement / move / play_card).
// Routing (see App.jsx): /online is the room browser, /room/:code is a
// room — waiting, draft, placement, battle, all of it. Which of those is
// on screen is still the SERVER's match phase, never part of the URL; the
// URL only says which room you're in. Landing on /room/:code (invite link,
// reload) walks into that room — reclaiming your own seat if this browser
// holds one (see net/seat.js), otherwise joining as a new player.
export default function OnlineApp({ onExit }) {
  const navigate = useNavigate()
  // BrowserRouter hands out a new navigate on every location change — the
  // long-lived socket handlers below read it through this ref instead of
  // depending on it (which would tear the socket down on every navigation).
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const urlCode = useMatch('/room/:code')?.params.code?.toUpperCase() ?? null
  const [phase, setPhase]       = useState('menu') // 'menu' | 'waiting' | 'match'
  const [busy, setBusy]         = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [room, setRoom]         = useState(null)   // { code, color, players }
  const [match, setMatch]       = useState(null)   // per-color redacted match view
  const [opponentLeft, setOpponentLeft] = useState(false)
  // Live list of open public lobbies, pushed by the server while we're on
  // the browse screen (see rooms.js's broadcastLobbyList).
  const [lobbyRooms, setLobbyRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)

  const [boardMode, dispatch]           = useReducer(boardModeReducer, IDLE)
  const [lastMoveAnim, setLastMoveAnim] = useState(null)
  const [actionToast, setActionToast]   = useState(null)
  const [meteorStrikeAnim, setMeteorStrikeAnim] = useState(null) // { strikes: [{square, destroyed}], ts }
  const [mineStrikeAnim, setMineStrikeAnim] = useState(null) // { strike: {square, owner}, ts }
  const [pendingPromotion, setPendingPromotion] = useState(null) // { from, to } awaiting a piece choice
  const [surrenderConfirm, setSurrenderConfirm] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false) // browser "back" pressed mid-match
  const [nickname, setNickname] = useState(loadNickname)
  const [premove, setPremove] = useState(null) // { from, to } | null
  const premoveRef = useRef(null) // mirrors premove for the socket handler below (avoids a stale closure)
  useEffect(() => { premoveRef.current = premove }, [premove])
  // Which battle-log entry the board is currently displaying — null means
  // "live" (see GameView.jsx's displayGameState). Never carries over: each
  // round is a fresh actionLog (see initialState.js), so a stale index
  // would either point at nothing or, worse, silently land on the wrong
  // round's snapshot.
  const [historyIndex, setHistoryIndex] = useState(null)
  useEffect(() => { setHistoryIndex(null) }, [match?.round])

  // Match-over jingle: win/lose from my perspective, once, when the whole
  // best-of-N finishes. (Per-ROUND win/lose is played by RoundSummary; the
  // final round never shows a RoundSummary — it goes straight to the
  // match-over screen — so that ending is covered here instead.) Keyed on
  // phase so it fires exactly on the transition into match_over.
  useEffect(() => {
    if (match?.phase !== 'match_over' || !room?.color) return
    const opp = room.color === 'white' ? 'black' : 'white'
    play(match.scores[room.color] > match.scores[opp] ? 'win' : 'lose')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.phase])

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

    socket.on('room_update', (data) => {
      setRoom(prev => (prev ? { ...prev, ...data } : prev))
      // Both seats present again — any latched "opponent left" flag is
      // stale by definition (the server only emits opponent_left during a
      // live match now, but a transient dev-reload/etc could still have
      // latched it earlier; without this it would sit invisible until the
      // battle screen finally rendered it as a bogus banner).
      if (data.players?.white?.connected && data.players?.black?.connected) {
        setOpponentLeft(false)
      }
    })

    socket.on('match_update', ({ match: m, lastAction, meteorStrikes, mineStrike, ...roomInfo }) => {
      setRoom(prev => (prev ? { ...prev, ...roomInfo } : prev))
      setMatch(m)
      dispatch({ type: 'CANCEL' })

      // Fire a queued premove once it's our turn; drop it if we've left battle.
      if (premoveRef.current) {
        if (m.phase === 'battle' && m.gameState.turn === roomInfo.color) {
          const { from, to } = premoveRef.current
          premoveRef.current = null
          setPremove(null)
          getSocket().emit('move', { from, to })
        } else if (m.phase !== 'battle') {
          premoveRef.current = null
          setPremove(null)
        }
      }
      // `hidden: true` means the server redacted this action's TARGET
      // square because it happened inside the actor's own active fog zone
      // (see rooms.js's redactLastAction) — the card itself is still shown
      // (never secret which card was played, only where), so the toast
      // fires exactly the same as a normal card play. Move/capture/bounce
      // actions carry no target-square secrecy at all — `hidden` only ever
      // applies to cards.
      if (lastAction) {
        if (['move', 'capture', 'bounce'].includes(lastAction.type)) {
          setLastMoveAnim({ type: lastAction.type, from: lastAction.from, to: lastAction.to, ts: Date.now() })
          // A capture is "get" if I was the one capturing, "lost" if it was
          // MY piece that just got taken. Plain moves/bounces are "move".
          if (lastAction.type === 'capture') play(lastAction.color === roomInfo.color ? 'get' : 'lost')
          else play('move')
        } else if (lastAction.type === 'draw_declined' && lastAction.color !== roomInfo.color) {
          flashError('Соперник отклонил ничью')
        } else if (lastAction.type === 'card') {
          const card = CARD_DEFS[lastAction.cardId]
          setActionToast({ type: 'card', color: lastAction.color, card, ts: Date.now() })
          setTimeout(() => setActionToast(null), 2000)
          play('card')
        }
        // The opponent just acted and the turn passed to us — one gentle
        // "you're up" chime layered after their action's own sound.
        const passedTurn = ['move', 'capture', 'bounce', 'card'].includes(lastAction.type)
        if (passedTurn && m.phase === 'battle' && m.gameState.turn === roomInfo.color && lastAction.color !== roomInfo.color) {
          setTimeout(() => play('yourTurn'), 220)
        }
      }
      // Meteor impacts are never secret (unlike the target square while
      // still in flight) — both players see the same explosion, at the
      // same square, the moment it lands.
      if (meteorStrikes && meteorStrikes.length > 0) {
        setMeteorStrikeAnim({ strikes: meteorStrikes, ts: Date.now() })
        setTimeout(() => setMeteorStrikeAnim(null), 900)
      }
      // Mine impacts are never secret either (unlike the square while still
      // armed) — both players see the same reveal, at the same square, the
      // instant it's stepped on.
      if (mineStrike) {
        setMineStrikeAnim({ strike: mineStrike, ts: Date.now() })
        setTimeout(() => setMineStrikeAnim(null), 900)
      }
      setPhase('match')
    })

    socket.on('lobby_list', ({ rooms }) => {
      setLobbyRooms(rooms ?? [])
      setRoomsLoading(false)
    })

    socket.on('opponent_left', () => setOpponentLeft(true))
    // socket.io reconnects on its own after a dropped connection, but as a
    // NEW socket the server doesn't know — reclaim the seat right away.
    socket.on('connect', () => {
      if (roomRef.current) enterRef.current(roomRef.current.code)
    })
    // Our seat was reclaimed by another socket holding the same token (a
    // duplicated tab) — see index.js's rejoin_room. This tab is out.
    socket.on('seat_taken', () => {
      flashError('Игра открыта в другой вкладке')
      clearSeat()
      resetRoomState()
      navigateRef.current('/online', { replace: true })
    })
    socket.on('game_error', ({ message }) => flashError(message))
    socket.on('connect_error', () => flashError('Не удалось подключиться к серверу'))

    return () => {
      socket.off('room_update')
      socket.off('match_update')
      socket.off('lobby_list')
      socket.off('opponent_left')
      socket.off('connect')
      socket.off('seat_taken')
      socket.off('game_error')
      socket.off('connect_error')
      disconnectSocket()
    }
  }, [flashError])

  // Subscribe to the lobby list only while actually browsing — a room in
  // progress has no use for it, and the server would otherwise keep fanning
  // list updates out to every player mid-match.
  useEffect(() => {
    if (phase !== 'menu') {
      getSocket().emit('unlist_rooms')
      return
    }
    let cancelled = false
    setRoomsLoading(true)
    const socket = connectSocket()
    const subscribe = () => {
      request('list_rooms')
        .then(res => { if (!cancelled) { setLobbyRooms(res?.rooms ?? []); setRoomsLoading(false) } })
        .catch(() => { if (!cancelled) setRoomsLoading(false) })
    }
    if (socket.connected) subscribe()
    else socket.once('connect', subscribe)
    return () => { cancelled = true }
  }, [phase])

  // Seated in a room (create/join/rejoin all answer the same shape) — the
  // match itself, if one is running, arrives separately as match_update.
  function seat(res) {
    saveSeat(res.code, res.token)
    setRoom({ code: res.code, color: res.color, host: res.host, visibility: res.visibility, players: res.players })
    setPhase(prev => (prev === 'match' ? prev : 'waiting'))
    navigate(`/room/${res.code}`, { replace: urlCode === res.code })
  }

  async function handleCreate(color, visibility) {
    setBusy(true)
    try {
      seat(await request('create_room', { color, name: nickname, visibility }))
    } catch (e) {
      flashError(e.message)
    }
    setBusy(false)
  }

  // A private room against the AI — the server seats the bot and starts
  // the match straight away (see server/bot.js).
  async function handlePlayBot(level, color) {
    setBusy(true)
    try {
      seat(await request('create_bot_room', { level, color, name: nickname }))
    } catch (e) {
      flashError(e.message)
    }
    setBusy(false)
  }

  async function handleJoin(code) {
    setBusy(true)
    try {
      seat(await request('join_room', { code, name: nickname }))
    } catch (e) {
      flashError(e.message)
    }
    setBusy(false)
  }

  // Walks into room `code` — reclaiming our own seat if this browser holds
  // one (reload, dropped connection), otherwise joining as a new player
  // (invite link). A room that's gone/full sends us back to the browser.
  const enteringRef = useRef(null)
  async function enterRoom(code) {
    if (enteringRef.current === code) return
    enteringRef.current = code
    const token = loadSeatToken(code)
    try {
      if (token) {
        try {
          seat(await request('rejoin_room', { code, token }))
          return
        } catch {
          clearSeat() // seat's gone (e.g. lobby seats free up on disconnect) — try joining fresh
        }
      }
      seat(await request('join_room', { code, name: nickname }))
    } catch (e) {
      flashError(e.message)
      resetRoomState()
      navigate('/online', { replace: true })
    } finally {
      enteringRef.current = null
    }
  }
  const enterRef = useRef(enterRoom)
  enterRef.current = enterRoom
  const roomRef = useRef(room)
  roomRef.current = room

  // URL -> room, reacting only to the URL actually CHANGING. The router
  // commits a navigation a beat after our own state updates, so right after
  // create/join there's a render where we're already in the room but the
  // URL still says /online (and right after leaving, one where the room is
  // gone but the URL still says /room/:code) — treating those in-between
  // renders as "the user navigated" would leave a room we just made, or
  // walk back into one we just left.
  //   arrived on /room/:code (invite link, reload) and not in it: enter it
  //   moved off our room's URL (browser back): in a live match, ask first
  //   (and put the URL back meanwhile); otherwise just leave.
  const prevUrlCodeRef = useRef(null)
  useEffect(() => {
    const prevUrlCode = prevUrlCodeRef.current
    prevUrlCodeRef.current = urlCode
    if (urlCode && urlCode !== prevUrlCode && room?.code !== urlCode) {
      const socket = connectSocket()
      const go = () => enterRef.current(urlCode)
      if (socket.connected) go()
      else socket.once('connect', go)
      return
    }
    if (room && prevUrlCode === room.code && urlCode !== room.code) {
      const liveMatch = phase === 'match' && match?.phase !== 'match_over'
      if (liveMatch) {
        navigate(`/room/${room.code}`)
        setLeaveConfirm(true)
      } else {
        handleLeave()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode, room?.code])

  function resetRoomState() {
    setPhase('menu')
    setRoom(null)
    setMatch(null)
    setOpponentLeft(false)
    setActionToast(null)
    setLastMoveAnim(null)
    setMeteorStrikeAnim(null)
    setPendingPromotion(null)
    setSurrenderConfirm(false)
    setLeaveConfirm(false)
    premoveRef.current = null
    setPremove(null)
    dispatch({ type: 'CANCEL' })
  }

  function handleLeave() {
    getSocket().emit('leave_room')
    clearSeat()
    resetRoomState()
    if (urlCode) navigate('/online') // already off /room/:code if we got here via browser back
  }

  // Transient messages (server rejections, "opponent declined the draw", …)
  // — shown on every match screen, not just the lobby, which used to be the
  // only place errorMsg was rendered at all.
  const toast = errorMsg ? <div className="game-toast">{errorMsg}</div> : null

  // ── Menu / waiting for the second seat — no match yet ─────────────
  if (phase !== 'match' || !room || !match) {
    return (
      <PageTransition pageKey={phase === 'menu' ? 'online-menu' : 'online-waiting'}>
        <Lobby
          phase={phase === 'menu' ? 'menu' : 'waiting'}
          room={room}
          busy={busy}
          errorMsg={errorMsg}
          onCreate={handleCreate}
          onJoin={handleJoin}
          onPlayBot={handlePlayBot}
          onLeave={handleLeave}
          onStart={() => getSocket().emit('start_match')}
          onExit={onExit}
          nickname={nickname}
          onNicknameChange={handleNicknameChange}
          rooms={lobbyRooms}
          roomsLoading={roomsLoading}
        />
      </PageTransition>
    )
  }

  const myColor  = room.color
  const oppColor = other(myColor)

  // ── Round-over summary ───────────────────────────────────────────────
  // Shown once per round transition, right before the next round's draft.
  // pageKey is "battle", SHARED with the live battle below — a round ending
  // is not a new page, it's the same board now frozen with a result banner
  // over it, so no transition plays between them; only the banner
  // announces itself (its own result-banner-in, see App.css). Placement
  // has its own key, but its exit into battle is just a soft whole-screen
  // crossfade (see PageTransition.css) since the two share identical
  // geometry — the real page transitions are draft -> placement and
  // summary -> next round's draft.
  // Server-driven: stays up until the server has registered MY "continue"
  // (or its SUMMARY_MAX_SECONDS cap ran out) — the next draft's clocks only
  // start once both players are past it (see matchEngine.js).
  if (match.phase === 'draft' && match.previousRound != null && match.summaryReady && !match.summaryReady[myColor]) {
    return (
      <>
        {toast}
        <PageTransition pageKey="battle">
          <RoundSummary
            match={match}
            // Colors swap every round (see matchEngine.js) — during the round
            // that just ended, "my" pieces were whatever color I'm NOT playing
            // now, so the frozen board must be oriented/labeled accordingly.
            previousMyColor={oppColor}
            room={room}
            onContinue={() => getSocket().emit('summary_continue')}
          />
        </PageTransition>
      </>
    )
  }

  // ── Draft phase (turn-based, no bans — every pick is live/visible) ──
  if (match.phase === 'draft') {
    return (
      <>
        {toast}
        <PageTransition pageKey="draft">
          <DraftPhase
            round={match.round}
            boardPattern={match.boardPattern}
            draft={match.draft}
            myColor={myColor}
            matchScore={{
              round: match.round,
              white: match.scores.white,
              black: match.scores.black,
              whiteName: room.players?.white?.name,
              blackName: room.players?.black?.name,
            }}
            onPick={(item) => { play('buy'); getSocket().emit('draft_pick', item) }}
            onDone={() => getSocket().emit('draft_done')}
          />
        </PageTransition>
      </>
    )
  }

  // ── Placement phase (open, shared countdown) ───────────────────────
  if (match.phase === 'placement') {
    const placementSeconds = PLACEMENT_TIME_BY_ROUND[Math.min(match.round, 3)]
    return (
      <>
        {toast}
        <PageTransition pageKey="placement">
          <PlacementPhase
            boardPattern={match.boardPattern}
            draftedPieces={match.draft.picks[myColor].pieces}
            myCards={match.draft.picks[myColor].cards}
            myColor={myColor}
            opponentReady={match.placement[oppColor].ready}
            myMap={match.placement[myColor].map}
            oppMap={match.placement[oppColor].map}
            deadline={match.placementDeadline}
            totalSeconds={placementSeconds}
            oppColor={oppColor}
            oppPieces={match.draft.picks[oppColor].pieces}
            oppCards={match.draft.picks[oppColor].cards}
            matchScore={{
              round: match.round,
              white: match.scores.white,
              black: match.scores.black,
              whiteName: room.players?.white?.name,
              blackName: room.players?.black?.name,
            }}
            onChange={(map) => getSocket().emit('update_placement', { map })}
            onSubmit={(map) => getSocket().emit('submit_placement', { map })}
          />
        </PageTransition>
      </>
    )
  }

  // ── Battle / match-over — reuse the normal GameView battle UI ──────
  const gameState    = match.gameState
  const matchOver     = match.phase === 'match_over'
  const myTurn        = !matchOver && gameState.turn === myColor
  const inCheck        = match.phase === 'battle' && isKingInCheck(gameState, gameState.turn)
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

  function handleAnswerDraw(accept) {
    getSocket().emit('answer_draw', { accept })
  }

  function handleSurrenderConfirm() {
    getSocket().emit('surrender')
    setSurrenderConfirm(false)
  }

  function handleCardSelect(card) {
    if (match.phase !== 'battle' || !myTurn || cardsLocked) return
    // Same pick/unpick tick a board piece gets (see Board.jsx) — selecting
    // a card to aim it, or clicking it again to cancel, both play 'select'.
    play('select')
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
      {toast}
      <PageTransition pageKey="battle">
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
        {leaveConfirm && (
          <ConfirmModal
            title="Выйти из матча?"
            message="Вы покинете матч. Часы продолжат идти, пока вас нет."
            confirmLabel="Выйти"
            onConfirm={handleLeave}
            onCancel={() => setLeaveConfirm(false)}
          />
        )}
        {match.phase === 'battle' && gameState.drawOffer === oppColor && !surrenderConfirm && (
          <ConfirmModal
            title="Соперник предлагает ничью"
            message="Раунд закончится вничью, счёт матча не изменится."
            confirmLabel="Принять"
            cancelLabel="Отклонить"
            onConfirm={() => handleAnswerDraw(true)}
            onCancel={() => handleAnswerDraw(false)}
          />
        )}
        {surrenderConfirm && (
          <ConfirmModal
            title="Сдаться?"
            message="Вы проиграете этот раунд сопернику. Следующий раунд начнётся с нуля — новый драфт для обеих сторон."
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
          mineStrikeAnim={mineStrikeAnim}
          boardFlipped={myColor === 'black'}
          // Always your own color (not gated by whose turn it is) so you can
          // select your pieces to queue a premove while waiting — actually
          // executing a move is what stays gated, via isMyTurn below.
          boardPlayerColor={matchOver ? 'none' : myColor}
          isMyTurn={myTurn}
          premove={premove}
          onSetPremove={setPremove}
          onClearPremove={() => setPremove(null)}
          onMove={handleMove}
          onPlayCard={handlePlayCard}
          battleLog={gameState.actionLog}
          historyIndex={historyIndex}
          onSelectHistory={setHistoryIndex}
          onReturnToLive={() => setHistoryIndex(null)}
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
            controllable: false,
          }}
          bottomPanel={{
            color: myColor,
            name: room.players?.[myColor]?.name,
            capturedByMe: myCaptured,
            active: myTurn,
            inCheck: inCheck && myTurn,
            isYou: true,
            // Server also enforces this — surrendering mid-opponent's-turn
            // isn't allowed — but gating the button here avoids a round-trip
            // error toast for something the client already knows is invalid.
            onSurrender: match.phase === 'battle' ? () => setSurrenderConfirm(true) : undefined,
            onOfferDraw: match.phase === 'battle' ? () => getSocket().emit('offer_draw') : undefined,
            drawOfferDisabled: !!gameState.drawOffer
              || gameState.drawOfferedAt?.[myColor] === (gameState.moveHistory?.length ?? 0),
            controllable: myTurn,
          }}
          bottomHand={{
            cards: gameState.cards[myColor].hand,
            isActive: myTurn && !cardsLocked,
            selectedCardId: boardMode.type === 'card_targeting' ? boardMode.card.id : null,
            onCardClick: handleCardSelect,
          }}
        />
      </PageTransition>
    </>
  )
}
