import { t, tErr } from './i18n'
import { useState, useReducer, useCallback } from 'react'
import GameView from './rendering/GameView'
import PromotionPicker from './rendering/PromotionPicker'
import ResultModal from './rendering/match/ResultModal'
import { resultLine } from './rendering/RoundSummary'
import { SettingsButton } from './rendering/Settings'
import { IconRefresh } from './rendering/ui/Icons'
import { createDraftRoundState } from './game/initialState'
import { CARD_DEFS, getValidTargets } from './game/cards'
import { needsPromotion } from './game/chess'
import { boardModeReducer, IDLE } from './game/boardMode'
import { tryMove, tryPlayCard } from './game/sandboxEngine'
import { play } from './sound'


// Matches .sandbox-leaving's own animation length (see App.css).
const EXIT_ANIM_MS = 180

// Every card in the game, both hands, one of each piece type per side plus
// a pawn one step from promoting — enough to manually poke at every skill
// without going through a draft. 8x8 with two blocked holes so add_cell's
// "reopen a hole" / border-target behavior can be exercised too.
const SANDBOX_BOARD = { rows: 8, cols: 8, blockedCells: ['d4', 'e5'] }
const ALL_CARD_IDS = Object.keys(CARD_DEFS)

function freshSandboxState() {
  // Dev-only: tools/clips injects a staged position to film (never in prod builds).
  const clip = import.meta.env.DEV && typeof window !== 'undefined' ? window.__clipScenario : null
  if (clip) return createDraftRoundState(clip.board, clip.white, clip.black, clip.cards.white, clip.cards.black, null)
  return createDraftRoundState(
    SANDBOX_BOARD,
    {
      a1: { type: 'rook', color: 'white', hp: 1 },
      b1: { type: 'knight', color: 'white', hp: 1 },
      c1: { type: 'bishop', color: 'white', hp: 1 },
      d1: { type: 'queen', color: 'white', hp: 1 },
      e1: { type: 'king', color: 'white', hp: 1 },
      e2: { type: 'pawn', color: 'white', hp: 1 },
      f2: { type: 'pawn', color: 'white', hp: 1 },
      g7: { type: 'pawn', color: 'white', hp: 1 }, // one step from promoting
    },
    {
      h8: { type: 'rook', color: 'black', hp: 1 },
      g8: { type: 'knight', color: 'black', hp: 1 },
      f8: { type: 'bishop', color: 'black', hp: 1 },
      e8: { type: 'queen', color: 'black', hp: 1 },
      d8: { type: 'king', color: 'black', hp: 1 },
      d7: { type: 'pawn', color: 'black', hp: 1 },
      c7: { type: 'pawn', color: 'black', hp: 1 },
      b2: { type: 'pawn', color: 'black', hp: 1 }, // one step from promoting
    },
    ALL_CARD_IDS, ALL_CARD_IDS,
    null, // untimed — testing shouldn't get cut off mid-poke
  )
}

// Local hot-seat sandbox — no server, no draft/placement, straight into a
// battle with every card in both hands so every skill can be clicked by
// hand. Whoever's turn it is is "in control" (their hand/panel sits at the
// bottom); the board itself never flips, so the layout stays predictable
// while you're testing both sides yourself.
export default function SandboxApp({ onExit }) {
  const [gameState, setGameState] = useState(freshSandboxState)
  const [gameResult, setGameResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [leaving, setLeaving] = useState(false)

  // Same reasoning as PlayOnlineMenu.jsx's back button: this unmounts the
  // whole SandboxApp, which App.jsx's PageTransition intentionally never
  // snapshots for an exit animation (nothing here has side effects worth
  // protecting like OnlineApp's socket, but re-running this component's
  // hooks mid-fade would still restart it). Fade out locally first, then
  // call the real onExit once nothing's left on screen to cut abruptly.
  function handleExit() {
    if (leaving) return
    setLeaving(true)
    setTimeout(onExit, EXIT_ANIM_MS)
  }

  const [boardMode, dispatch] = useReducer(boardModeReducer, IDLE)
  const [lastMoveAnim, setLastMoveAnim] = useState(null)
  const [cardSplash, setCardSplash] = useState(null)
  const [meteorStrikeAnim, setMeteorStrikeAnim] = useState(null)
  const [mineStrikeAnim, setMineStrikeAnim] = useState(null)
  const [pendingPromotion, setPendingPromotion] = useState(null)
  const [historyIndex, setHistoryIndex] = useState(null) // null = live, see GameView.jsx

  const flashError = useCallback((msg) => {
    setErrorMsg(tErr(msg))
    setTimeout(() => setErrorMsg(null), 3000)
  }, [])

  function applyResult(res) {
    if (res.error) { flashError(res.error); return }
    setGameState(res.gameState)
    dispatch({ type: 'CANCEL' })

    const lastAction = res.lastAction
    if (lastAction) {
      if (['move', 'capture', 'bounce'].includes(lastAction.type)) {
        setLastMoveAnim({ type: lastAction.type, from: lastAction.from, to: lastAction.to, ts: Date.now() })
        // Hot-seat: whoever moves IS "you" this turn, so a capture is
        // always "get" (you took a piece); plain moves are "move".
        play(lastAction.type === 'capture' ? 'get' : 'move')
      } else if (lastAction.type === 'card') {
        const ts = Date.now()
        setCardSplash({ cardId: lastAction.cardId, color: lastAction.color, ts })
        setTimeout(() => setCardSplash(s => (s?.ts === ts ? null : s)), 1900)
        play('card')
      }
    }
    if (res.meteorStrikes && res.meteorStrikes.length > 0) {
      setMeteorStrikeAnim({ strikes: res.meteorStrikes, ts: Date.now() })
      setTimeout(() => setMeteorStrikeAnim(null), 900)
    }
    if (res.mineStrike) {
      setMineStrikeAnim({ strike: res.mineStrike, ts: Date.now() })
      setTimeout(() => setMineStrikeAnim(null), 900)
    }
    if (res.result) setGameResult(res.result)
  }

  function handleRestart() {
    setGameState(freshSandboxState())
    setGameResult(null)
    setLastMoveAnim(null)
    setCardSplash(null)
    setMeteorStrikeAnim(null)
    setMineStrikeAnim(null)
    setPendingPromotion(null)
    setHistoryIndex(null)
    dispatch({ type: 'CANCEL' })
  }

  const myColor  = gameState.turn // whoever's turn it is controls the bottom panel/hand
  const gameOver = !!gameResult
  const cardsLocked = gameState.cardPlayedThisTurn


  function handleMove({ from, to }) {
    if (gameOver) return
    if (needsPromotion(gameState, from, to)) {
      setPendingPromotion({ from, to })
      return
    }
    applyResult(tryMove(gameState, myColor, from, to))
  }

  function handlePromotionPick(promotion) {
    if (!pendingPromotion) return
    applyResult(tryMove(gameState, myColor, pendingPromotion.from, pendingPromotion.to, promotion))
    setPendingPromotion(null)
  }

  function handlePromotionCancel() {
    setPendingPromotion(null)
  }

  function handleCardSelect(card) {
    if (gameOver || cardsLocked) return
    play('select')
    if (boardMode.type === 'card_targeting' && boardMode.card.id === card.id) {
      dispatch({ type: 'CANCEL' })
      return
    }
    const validTargets = getValidTargets(card.id, gameState, myColor)
    dispatch({ type: 'PLAY_CARD', card, validTargets })
  }

  function handlePlayCard({ card, target }) {
    if (gameOver || cardsLocked) return
    applyResult(tryPlayCard(gameState, myColor, card.id, target))
  }

  return (
    <div className={leaving ? 'sandbox-leaving' : undefined}>
      {errorMsg && <div className="ui-toast" role="status">{errorMsg}</div>}

      <GameView
        phase="sandbox"
        title={t('menu.sandbox')}
        boardPattern={null}
        names={{ white: t('common.white'), black: t('common.black') }}
        scores={{ white: 0, black: 0 }}
        gameState={gameState}
        boardMode={boardMode}
        dispatch={dispatch}
        lastMoveAnim={lastMoveAnim}
        cardSplash={cardSplash}
        meteorStrikeAnim={meteorStrikeAnim}
        mineStrikeAnim={mineStrikeAnim}
        myColor={myColor}
        flipped={false}
        boardPlayerColor={gameOver ? 'none' : myColor}
        isMyTurn
        onBack={handleExit}
        onMove={gameOver ? undefined : handleMove}
        onPlayCard={gameOver ? undefined : handlePlayCard}
        historyIndex={historyIndex}
        onSelectHistory={setHistoryIndex}
        onReturnToLive={() => setHistoryIndex(null)}
        finished={gameOver}
        actions={(
          <>
            <SettingsButton />
            <button className="ui-btn has-lbl" onClick={handleRestart} title={t('sandbox.reset')} data-testid="sandbox-reset"><IconRefresh /><span className="lbl">{t('sandbox.reset')}</span></button>
          </>
        )}
        hand={{
          cards: gameState.cards[myColor].hand,
          isActive: !cardsLocked && !gameOver,
          selectedCardId: boardMode.type === 'card_targeting' ? boardMode.card.id : null,
          onCardClick: handleCardSelect,
        }}
      >
        {pendingPromotion && (
          <PromotionPicker
            color={myColor}
            square={pendingPromotion.to}
            onPick={handlePromotionPick}
            onCancel={handlePromotionCancel}
          />
        )}
        {gameResult && (
          <ResultModal
            title={gameResult.type === 'draw' || gameResult.type === 'stalemate' ? t('summary.drawTitle') : t('sandbox.wins', { side: t(gameResult.winner === 'white' ? 'common.white' : 'common.black') })}
            reason={resultLine(gameResult)}
            outcome={gameResult.winner ? 'win' : 'draw'}
            showDots={false}
            me={{ color: 'white', name: t('common.white'), score: gameResult.winner === 'white' ? 1 : 0 }}
            opp={{ color: 'black', name: t('common.black'), score: gameResult.winner === 'black' ? 1 : 0 }}
            secondary={{ label: t('common.exit'), onClick: handleExit }}
            primary={{ label: t('sandbox.reset'), onClick: handleRestart }}
          />
        )}
      </GameView>
    </div>
  )
}
