import { useState } from 'react'
import { ALL_PIECE_TYPES, ALL_CARD_IDS } from '../game/draftEngine'
import { CARD_DEFS } from '../game/cards'
import { PIECE_GLYPHS, PIECE_LABEL, shopPieceCost } from '../game/economy'
import BoardThumbnail from './BoardThumbnail'
import './Card.css' // reuses .card-help-btn / .card-tooltip for card descriptions here too
import './DraftPhase.css'

function targetKey(t) {
  return t.kind === 'piece' ? `piece:${t.pieceType}` : `card:${t.cardId}`
}

function itemCost(t) {
  return t.kind === 'piece' ? shopPieceCost(t.pieceType) : CARD_DEFS[t.cardId].cost
}

// Draft = two blind, simultaneous sub-phases (see draftEngine.js): first
// both sides secretly ban a few catalog entries FOR THE OPPONENT, then
// (once both bans are revealed) both sides freely spend their budget on
// anything not banned for them — no turn order, no shared/scarce pool,
// supply is unlimited. Both sub-phases follow the exact same "build your
// choice locally, submit once, wait for the other side" shape as hidden
// placement.
export default function DraftPhase({ round, boardPattern, draft, myColor, onBan, onBuy }) {
  const oppColor = myColor === 'white' ? 'black' : 'white'

  return (
    <div className="draft-screen">
      <div className="draft-header">
        <span className="draft-round">Раунд {round}</span>
      </div>

      <div className="draft-board-card">
        <span className="draft-board-card-label">Карта этого раунда</span>
        <BoardThumbnail boardPattern={boardPattern} cellSize={18} />
        <span className="draft-board-card-name">{boardPattern.name} · {boardPattern.rows}×{boardPattern.cols}</span>
      </div>

      {draft.phase === 'ban'
        ? <BanStep draft={draft} myColor={myColor} oppColor={oppColor} onBan={onBan} />
        : <BuyStep draft={draft} myColor={myColor} oppColor={oppColor} onBuy={onBuy} />}
    </div>
  )
}

// A catalog tile shared by both sub-phases — same visual language as the
// old draft-pick-btn, just with different disabled/marked states depending
// on which step is using it (selected-for-ban vs banned-for-me vs
// unaffordable). Cards (not pieces — those are self-explanatory) get the
// same "?" tooltip as an in-hand Card during battle, since a ban/buy
// decision needs the full rules text, not just a glyph and a price.
function CatalogTile({ target, glyph, label, price, accent, desc, state, onClick }) {
  return (
    <button
      className={`draft-pick-btn${target.kind === 'card' ? ' card' : ''}${state ? ` ${state}` : ''}`}
      style={accent ? { '--accent': accent } : undefined}
      disabled={state === 'banned' || state === 'unaffordable' || !onClick}
      onClick={onClick}
    >
      {desc && (
        <span
          role="button"
          tabIndex={0}
          className="card-help-btn"
          onClick={e => e.stopPropagation()}
          aria-label={`Описание карты: ${label}`}
        >
          ?
          <span className="card-tooltip">
            <span className="card-tooltip-name">{label}</span>
            {desc}
          </span>
        </span>
      )}
      <span className="draft-pick-glyph">{glyph}</span>
      <span className="draft-pick-label">{label}</span>
      <span className="draft-pick-price">🪙 {price}</span>
      {state === 'banned' && <span className="draft-pick-banned-mark">🚫</span>}
    </button>
  )
}

function catalogTargets() {
  const pieces = ALL_PIECE_TYPES.map(pieceType => ({ kind: 'piece', pieceType }))
  const cards  = ALL_CARD_IDS.map(cardId => ({ kind: 'card', cardId }))
  return [...pieces, ...cards]
}

// ── Ban step ─────────────────────────────────────────────────────────
function BanStep({ draft, myColor, oppColor, onBan }) {
  const [selected, setSelected] = useState([])
  const submitted    = draft.bans[myColor] !== null
  const oppSubmitted = draft.bans[oppColor] !== null
  const mySubmittedTargets = submitted ? draft.bans[myColor] : selected

  const toggle = (target) => {
    if (submitted) return
    const key = targetKey(target)
    setSelected(sel => {
      if (sel.some(t => targetKey(t) === key)) return sel.filter(t => targetKey(t) !== key)
      if (sel.length >= draft.banCount) return sel
      return [...sel, target]
    })
  }

  return (
    <>
      <div className="draft-turn-banner mine">
        {submitted
          ? (oppSubmitted ? 'Оба бана раскрыты — переходим к закупке…' : 'Баны отправлены — ждём соперника…')
          : `Забаньте ${draft.banCount} ${draft.banCount === 1 ? 'вещь' : 'вещи'} сопернику — пешку банить нельзя`}
      </div>

      <div className="draft-budgets">
        <div className="draft-budget mine">
          <span className="draft-budget-label">Бюджет раунда</span>
          <span className="draft-budget-value">🪙 {draft.budgets[myColor]}</span>
        </div>
      </div>

      <div className="draft-ban-counter">
        Выбрано: <b>{mySubmittedTargets.length}</b> / {draft.banCount}
      </div>

      <div className="draft-pools">
        <div className="draft-pool-group">
          <div className="draft-pool-title">Фигуры</div>
          <div className="draft-pool-items">
            {ALL_PIECE_TYPES.map(type => {
              const target = { kind: 'piece', pieceType: type }
              const isSelected = mySubmittedTargets.some(t => t.kind === 'piece' && t.pieceType === type)
              const isPawn = type === 'pawn'
              return (
                <CatalogTile
                  key={type}
                  target={target}
                  glyph={PIECE_GLYPHS.white[type]}
                  label={PIECE_LABEL[type]}
                  price={shopPieceCost(type)}
                  state={isPawn ? 'unbannable' : isSelected ? 'selected' : undefined}
                  onClick={submitted || isPawn ? undefined : () => toggle(target)}
                />
              )
            })}
          </div>
        </div>

        <div className="draft-pool-group">
          <div className="draft-pool-title">Карты</div>
          <div className="draft-pool-items">
            {ALL_CARD_IDS.map(cardId => {
              const card = CARD_DEFS[cardId]
              const target = { kind: 'card', cardId }
              const isSelected = mySubmittedTargets.some(t => t.kind === 'card' && t.cardId === cardId)
              return (
                <CatalogTile
                  key={cardId}
                  target={target}
                  glyph={card.glyph}
                  label={card.name}
                  price={card.cost}
                  accent={card.accent}
                  desc={card.desc}
                  state={isSelected ? 'selected' : undefined}
                  onClick={submitted ? undefined : () => toggle(target)}
                />
              )
            })}
          </div>
        </div>
      </div>

      {!submitted && (
        <button
          className="draft-pass-btn confirm"
          disabled={selected.length !== draft.banCount}
          onClick={() => onBan(selected)}
        >
          Подтвердить баны
        </button>
      )}
    </>
  )
}

// ── Buy step ─────────────────────────────────────────────────────────
function BuyStep({ draft, myColor, oppColor, onBuy }) {
  const [cart, setCart] = useState([])
  const submitted    = draft.picks[myColor] !== null
  const oppSubmitted = draft.picks[oppColor] !== null
  const budget    = draft.budgets[myColor]
  const bannedForMe = new Set((draft.bans[oppColor] ?? []).map(targetKey))
  const myBans      = draft.bans[myColor] ?? []

  const finalCart = submitted
    ? [
        ...draft.picks[myColor].pieces.map(pieceType => ({ kind: 'piece', pieceType })),
        ...draft.picks[myColor].cards.map(cardId => ({ kind: 'card', cardId })),
      ]
    : cart

  const spent      = finalCart.reduce((sum, t) => sum + itemCost(t), 0)
  const remaining  = budget - spent
  // Hard cap on PIECES only (cards don't count) — see draftEngine.js's
  // createDraftState: buying more pieces than fit on your home ranks would
  // leave hidden placement impossible to ever finish.
  const pieceCount     = finalCart.filter(t => t.kind === 'piece').length
  const piecesRemaining = draft.maxPieces - pieceCount

  const addItem = (target) => {
    if (submitted) return
    if (itemCost(target) > remaining) return
    if (target.kind === 'piece' && piecesRemaining <= 0) return
    setCart(c => [...c, target])
  }
  const removeItem = (idx) => {
    if (submitted) return
    setCart(c => c.filter((_, i) => i !== idx))
  }

  return (
    <>
      <div className="draft-turn-banner mine">
        {submitted
          ? (oppSubmitted ? 'Обе закупки раскрыты — переходим к расстановке…' : 'Закупка отправлена — ждём соперника…')
          : 'Купите что хотите — главное уложиться в бюджет'}
      </div>

      <div className="draft-budgets">
        <div className="draft-budget mine">
          <span className="draft-budget-label">Бюджет</span>
          <span className="draft-budget-value">🪙 {budget}</span>
        </div>
        <div className="draft-budget mine">
          <span className="draft-budget-label">Осталось</span>
          <span className="draft-budget-value">🪙 {remaining}</span>
        </div>
        <div className="draft-budget mine">
          <span className="draft-budget-label">Фигуры</span>
          <span className="draft-budget-value">{pieceCount} / {draft.maxPieces}</span>
        </div>
      </div>

      {myBans.length > 0 && (
        <div className="draft-ban-summary">
          Вы забанили сопернику: {myBans.map(t => (
            t.kind === 'piece' ? PIECE_LABEL[t.pieceType] : CARD_DEFS[t.cardId].name
          )).join(', ')}
        </div>
      )}

      <div className="draft-pools">
        <div className="draft-pool-group">
          <div className="draft-pool-title">Фигуры</div>
          <div className="draft-pool-items">
            {ALL_PIECE_TYPES.map(type => {
              const target = { kind: 'piece', pieceType: type }
              const banned = bannedForMe.has(targetKey(target))
              const affordable = itemCost(target) <= remaining
              const capReached = piecesRemaining <= 0
              const price = shopPieceCost(type)
              return (
                <CatalogTile
                  key={type}
                  target={target}
                  glyph={PIECE_GLYPHS.white[type]}
                  label={PIECE_LABEL[type]}
                  price={price}
                  state={banned ? 'banned' : !affordable || capReached ? 'unaffordable' : undefined}
                  onClick={submitted || banned || !affordable || capReached ? undefined : () => addItem(target)}
                />
              )
            })}
          </div>
        </div>

        <div className="draft-pool-group">
          <div className="draft-pool-title">Карты</div>
          <div className="draft-pool-items">
            {ALL_CARD_IDS.map(cardId => {
              const card = CARD_DEFS[cardId]
              const target = { kind: 'card', cardId }
              const banned = bannedForMe.has(targetKey(target))
              const affordable = itemCost(target) <= remaining
              return (
                <CatalogTile
                  key={cardId}
                  target={target}
                  glyph={card.glyph}
                  label={card.name}
                  price={card.cost}
                  accent={card.accent}
                  desc={card.desc}
                  state={banned ? 'banned' : !affordable ? 'unaffordable' : undefined}
                  onClick={submitted || banned || !affordable ? undefined : () => addItem(target)}
                />
              )
            })}
          </div>
        </div>
      </div>

      <div className="draft-rosters">
        <div className="draft-roster mine">
          <div className="draft-roster-header">
            <span className="draft-roster-label">Ваша корзина</span>
          </div>
          <div className="draft-roster-items">
            {finalCart.length === 0 && <span className="draft-roster-empty">пока пусто</span>}
            {finalCart.map((t, i) => (
              <span
                key={`b${i}`}
                className={`draft-roster-chip${t.kind === 'card' ? ' card' : ''}${submitted ? '' : ' removable'}`}
                style={t.kind === 'card' ? { '--accent': CARD_DEFS[t.cardId].accent } : undefined}
                title={submitted ? undefined : 'Нажмите, чтобы убрать'}
                onClick={submitted ? undefined : () => removeItem(i)}
              >
                {t.kind === 'piece' ? PIECE_GLYPHS[myColor][t.pieceType] : CARD_DEFS[t.cardId].glyph}
              </span>
            ))}
          </div>
        </div>
      </div>

      {!submitted && (
        <button className="draft-pass-btn confirm" onClick={() => onBuy(cart)}>
          Готово
        </button>
      )}
    </>
  )
}
