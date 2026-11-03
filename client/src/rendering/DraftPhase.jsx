import { ALL_PIECE_TYPES, ALL_CARD_IDS, nextItemCost, duplicateStep } from '../game/draftEngine'
import { CARD_DEFS } from '../game/cards'
import { PIECE_LABEL, shopPieceCost } from '../game/economy'
import BoardThumbnail from './BoardThumbnail'
import MatchScoreBoard from './MatchScoreBoard'
import Clock from './Clock'
import GameCard from './GameCard'
import { PIECE_ICONS } from './pieceIcons'
import './DraftPhase.css'

// What each already-purchased item in the roster actually cost — the
// draft only stores WHAT was bought (`draft.picks[color].pieces`/`.cards`,
// each just a flat list of ids in purchase order), not what was paid at
// the time, but that's fully reconstructable: within either list, the Nth
// copy of a given type always cost exactly base + N*duplicateStep (see
// draftEngine.js's nextItemCost) — no need to store history separately.
function rosterWithPrices(draft, color) {
  const seen = {}
  const priced = (kind, key, baseCost) => {
    const n = seen[key] ?? 0
    seen[key] = n + 1
    return { kind, key, price: baseCost + n * duplicateStep(kind === 'piece' ? { kind, pieceType: key } : { kind, cardId: key }) }
  }
  return [
    ...draft.picks[color].pieces.map(type => ({ ...priced('piece', type, shopPieceCost(type)), pieceType: type })),
    ...draft.picks[color].cards.map(id => ({ ...priced('card', id, CARD_DEFS[id].cost), cardId: id })),
  ]
}

// Turn-based draft, no bans: both sides watch each other's army form pick
// by pick (see draftEngine.js's submitPick — every purchase lands and
// broadcasts immediately, there's no hidden "cart" any more). Whoever's
// turn it is buys exactly one piece or card, or declares themselves done;
// a side that's out of budget (or chooses to stop early) is skipped for
// the rest of the phase rather than ever being waited on.
//
// Stacked layout (v2): the two rosters live in slim horizontal trays
// pinned above/below a full-width catalog, each tray carrying its own
// turn/done indicator — there's no separate turn-bar strip any more, and
// no wide side columns eating into the catalog's width.
export default function DraftPhase({ round, boardPattern, draft, myColor, matchScore, onPick, onDone }) {
  const oppColor = myColor === 'white' ? 'black' : 'white'
  // "Active" covers both literally-my-turn AND the case where the
  // opponent has already finished and I'm the only one left picking (see
  // draftEngine.js's advanceTurn) — draft.turn === myColor already covers
  // both, since turn only ever leaves me once I'm also done.
  // Clocks not started yet = the opponent is still on the round summary
  // (see matchEngine.js's trySummaryContinue) — nobody can pick until then.
  const waiting = draft.clocks != null && draft.turnStartedAt == null
  const myIsActive = !waiting && draft.turn === myColor && !draft.done[myColor]
  const iAmDone = draft.done[myColor]
  const oppDone = draft.done[oppColor]

  const myRoster  = rosterWithPrices(draft, myColor)
  const oppRoster = rosterWithPrices(draft, oppColor)
  const remaining = draft.budgets[myColor]
  const pieceCount = draft.picks[myColor].pieces.length
  const boardFull = pieceCount >= draft.maxPieces


  return (
    <div className="dr-screen">
      {/* Header carries only what you can't already see on the screen: the
         BOARD you're drafting for (the catalog hides the real board, so this
         thumbnail is the only preview of the map) and the match score. No
         "Раунд N — Драфт" / "ваш ход" captions — the phase is obvious from
         the catalog, and whose turn it is from the glowing active tray. */}
      <div className="dr-header">
        <div className="dr-board-card">
          <div className="dr-board-thumb-wrap">
            <BoardThumbnail boardPattern={boardPattern} cellSize={Math.floor(60 / Math.max(boardPattern.rows, boardPattern.cols))} />
          </div>
          <div className="dr-board-info">
            <span className="dr-board-name">{boardPattern.name}</span>
            <span className="dr-board-size">{boardPattern.rows}×{boardPattern.cols}</span>
          </div>
        </div>
        {matchScore && <MatchScoreBoard {...matchScore} />}
      </div>

      <Tray
        side="opp" label="Соперник" active={!myIsActive} done={oppDone}
        budget={draft.budgets[oppColor]} pieceCount={draft.picks[oppColor].pieces.length} maxPieces={draft.maxPieces}
        roster={oppRoster} pieceColor={oppColor}
        clock={draftClock(draft, oppColor)}
      />

      <div className="dr-catalog">
        <div className="dr-catalog-header">
          <span className="dr-catalog-title">Каталог</span>
          {waiting && <span className="dr-catalog-wait">Ждём соперника…</span>}
        </div>

        <div className="dr-catalog-scroll">
          <div className="dr-catalog-section">
            <div className="dr-section-title">Фигуры</div>
            <div className="dr-piece-grid">
              {ALL_PIECE_TYPES.map(type => {
                const target = { kind: 'piece', pieceType: type }
                const price = nextItemCost(draft, myColor, target)
                const state = !myIsActive ? 'notMyTurn' : boardFull ? 'soldOut' : price > remaining ? 'cantAfford' : 'available'
                return (
                  <PieceTile
                    key={type}
                    icon={PIECE_ICONS[myColor][type]}
                    label={PIECE_LABEL[type]}
                    price={price}
                    state={state}
                    onClick={state === 'available' ? () => onPick(target) : undefined}
                  />
                )
              })}
            </div>
          </div>

          <div className="dr-catalog-section">
            <div className="dr-section-title">Карты</div>
            <div className="dr-card-grid">
              {ALL_CARD_IDS.map(cardId => {
                const card = CARD_DEFS[cardId]
                const target = { kind: 'card', cardId }
                const price = nextItemCost(draft, myColor, target)
                const state = !myIsActive ? 'notMyTurn' : price > remaining ? 'cantAfford' : 'available'
                return (
                  <CatalogTile
                    key={cardId}
                    glyph={card.glyph}
                    accent={card.accent}
                    label={card.name}
                    desc={card.desc}
                    price={price}
                    state={state}
                    onClick={state === 'available' ? () => onPick(target) : undefined}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <Tray
        side="mine" label="Вы" active={myIsActive} done={iAmDone}
        budget={remaining} pieceCount={pieceCount} maxPieces={draft.maxPieces}
        roster={myRoster} pieceColor={myColor}
        clock={draftClock(draft, myColor)}
      >
        <button
          className="dr-tray-done-btn"
          disabled={!myIsActive}
          onClick={onDone}
        >
          Готово, я закончил
        </button>
      </Tray>
    </div>
  )
}

// Both draft catalog entries are now the same shared Balatro card (see
// GameCard.jsx) — a spell variant for cards, a piece variant for pieces.
// `state` still drives the "why can't I buy this" line and the dimmed,
// non-clickable disabled look. Cost is the gold top-right badge; the "?"
// (spells only) sits top-left.
function statusTag(state) {
  if (state === 'cantAfford') return { text: 'нет монет', tone: 'red' }
  if (state === 'soldOut')    return { text: 'нет места', tone: 'neutral' }
  return null
}

function CatalogTile({ glyph, accent, label, desc, price, state, onClick }) {
  const tag = statusTag(state)
  return (
    <GameCard
      variant="spell"
      accent={accent}
      icon={glyph}
      name={label}
      desc={desc}
      cost={price}
      status={tag?.text}
      statusTone={tag?.tone}
      disabled={!onClick}
      onClick={onClick}
    />
  )
}

function PieceTile({ icon, label, price, state, onClick }) {
  const tag = statusTag(state)
  return (
    <GameCard
      variant="piece"
      icon={icon}
      name={label}
      cost={price}
      status={tag?.text}
      statusTone={tag?.tone}
      disabled={!onClick}
      onClick={onClick}
    />
  )
}

// Each player's own draft time bank (see draftEngine.js's clocks) — only
// runs on their turn, same as the battle clock.
function draftClock(draft, color) {
  if (!draft.clocks) return null
  return (
    <Clock
      baseSeconds={draft.clocks[color]}
      turnStartedAt={draft.turnStartedAt}
      ticking={draft.turnStartedAt != null && draft.turn === color && !draft.done[color]}
      lowSeconds={10}
    />
  )
}

// A side's live status as one slim horizontal strip: turn indicator, done
// badge, budget, piece count, and every purchased item as a small icon-only
// chip you can scroll through — both sides visible at once, since open
// information is the whole point of the new draft. `children` (the done
// button) is only ever passed for the "mine" tray.
function Tray({ side, label, active, done, budget, pieceCount, maxPieces, roster, pieceColor, clock, children }) {
  // Explicit two-part layout (controls row + roster row) rather than a
  // flex-wrap+order scramble — the wrap version overflowed its own height
  // the moment the controls got wide (done badge/button) and spilled chips
  // out past the tray as artifacts. Here each part has a fixed height on
  // mobile, so the tray is always exactly as tall as its parts and clips
  // nothing.
  return (
    <div className={`dr-tray dr-tray-${side}${active ? ' active' : ''}`}>
      <span className="dr-tray-edge" />
      <div className="dr-tray-top">
        <span className={`dr-tray-dot${active ? ' active' : ''}`} />
        <span className="dr-tray-label">{label}</span>
        {done && <span className="dr-tray-done-badge">✓ Готово</span>}
        {!done && clock}
        <span className="dr-tray-budget"><span className="dr-coin" />{budget}</span>
        <span className="dr-tray-count">{pieceCount} / {maxPieces}<span className="dr-count-unit"> фигур</span></span>
        {children}
      </div>
      <div className="dr-tray-chips">
        {roster.length === 0 && <span className="dr-tray-empty">пока пусто</span>}
        {roster.map((it, i) => (
          <span className="dr-chip" key={`${it.key}-${i}`} title={it.kind === 'piece' ? PIECE_LABEL[it.pieceType] : CARD_DEFS[it.cardId].name}>
            {it.kind === 'piece' ? (
              PIECE_ICONS[pieceColor][it.pieceType]
            ) : (
              <span className="dr-chip-card" style={{ background: CARD_DEFS[it.cardId].accent }}>
                {CARD_DEFS[it.cardId].glyph}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
