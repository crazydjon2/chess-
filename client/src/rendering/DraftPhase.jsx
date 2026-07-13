import { ALL_PIECE_TYPES, ALL_CARD_IDS, targetKey, nextItemCost } from '../game/draftEngine'
import { CARD_DEFS } from '../game/cards'
import { PIECE_GLYPHS, PIECE_LABEL } from '../game/economy'
import BoardThumbnail from './BoardThumbnail'
import './Card.css' // reuses .card-help-btn / .card-tooltip for card descriptions here too
import './DraftPhase.css'

function itemsFor(draft, color) {
  return [
    ...draft.picks[color].pieces.map(pieceType => ({ kind: 'piece', pieceType })),
    ...draft.picks[color].cards.map(cardId => ({ kind: 'card', cardId })),
  ]
}

// Turn-based draft, no bans: both sides watch each other's army form pick
// by pick (see draftEngine.js's submitPick — every purchase lands and
// broadcasts immediately, there's no hidden "cart" any more). Whoever's
// turn it is buys exactly one piece or card, or declares themselves done;
// a side that's out of budget (or chooses to stop early) is skipped for
// the rest of the phase rather than ever being waited on.
export default function DraftPhase({ round, boardPattern, draft, myColor, onPick, onDone }) {
  const oppColor = myColor === 'white' ? 'black' : 'white'
  const myTurn   = draft.turn === myColor && !draft.done[myColor]
  const iAmDone  = draft.done[myColor]
  const oppDone  = draft.done[oppColor]

  const myCart  = itemsFor(draft, myColor)
  const oppCart = itemsFor(draft, oppColor)
  const remaining = draft.budgets[myColor]
  const pieceCount = draft.picks[myColor].pieces.length

  const bannerText = iAmDone
    ? 'Вы закончили закупку — ждём соперника…'
    : myTurn
      ? 'Ваш ход — выбирайте фигуру или карту'
      : oppDone
        ? 'Соперник закончил — доберите всё, что нужно'
        : 'Ход соперника — смотрите, что он берёт'

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

      <div className={`draft-turn-banner ${myTurn ? 'mine' : 'opp'}`}>{bannerText}</div>

      <div className="draft-sides">
        <SideSummary
          label="Вы" cart={myCart} budget={remaining} pieceCount={pieceCount}
          maxPieces={draft.maxPieces} done={iAmDone} active={myTurn} color={myColor} side="mine"
        />
        <SideSummary
          label="Соперник" cart={oppCart} budget={draft.budgets[oppColor]} pieceCount={draft.picks[oppColor].pieces.length}
          maxPieces={draft.maxPieces} done={oppDone} active={!myTurn && !iAmDone} color={oppColor} side="opp"
        />
      </div>

      <div className="draft-pools">
        <div className="draft-pool-group">
          <div className="draft-pool-title">Фигуры</div>
          <div className="draft-pool-items">
            {ALL_PIECE_TYPES.map(type => {
              const target = { kind: 'piece', pieceType: type }
              const price = nextItemCost(draft, myColor, target)
              const capReached = pieceCount >= draft.maxPieces
              const affordable = price <= remaining
              const disabled = !myTurn || capReached || !affordable
              return (
                <CatalogTile
                  key={type}
                  glyph={PIECE_GLYPHS.white[type]}
                  label={PIECE_LABEL[type]}
                  price={price}
                  state={disabled ? (capReached ? 'capped' : !affordable ? 'unaffordable' : 'waiting') : undefined}
                  onClick={disabled ? undefined : () => onPick(target)}
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
              const price = nextItemCost(draft, myColor, target)
              const affordable = price <= remaining
              const disabled = !myTurn || !affordable
              return (
                <CatalogTile
                  key={cardId}
                  glyph={card.glyph}
                  label={card.name}
                  price={price}
                  accent={card.accent}
                  desc={card.desc}
                  state={disabled ? (!affordable ? 'unaffordable' : 'waiting') : undefined}
                  onClick={disabled ? undefined : () => onPick(target)}
                />
              )
            })}
          </div>
        </div>
      </div>

      {myTurn && (
        <button
          className="draft-pass-btn confirm"
          disabled={pieceCount === 0}
          onClick={onDone}
          title={pieceCount === 0 ? 'Нужна хотя бы одна фигура' : undefined}
        >
          {pieceCount === 0 ? 'Нужна хотя бы одна фигура' : 'Готово, я закончил'}
        </button>
      )}
    </div>
  )
}

// A catalog tile — clickable only on your own turn, when affordable and
// (for pieces) there's still home-rank room. Cards get the same "?"
// tooltip as an in-hand Card during battle, since a purchase decision
// needs the full rules text, not just a glyph and a price.
function CatalogTile({ glyph, label, price, accent, desc, state, onClick }) {
  return (
    <button
      className={`draft-pick-btn${accent ? ' card' : ''}${state ? ` ${state}` : ''}`}
      style={accent ? { '--accent': accent } : undefined}
      disabled={!onClick}
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
    </button>
  )
}

// One side's live status: budget left, piece count, and a running roster
// of everything bought so far — shown for BOTH players at once, since
// open information (watching the opponent's army take shape) is the
// whole point of the new draft.
function SideSummary({ label, cart, budget, pieceCount, maxPieces, done, active, color, side }) {
  return (
    <div className={`draft-side ${side}${active ? ' active' : ''}`}>
      <div className="draft-side-header">
        <span className="draft-side-label">{label}</span>
        {done && <span className="draft-side-done">готово</span>}
      </div>
      <div className="draft-side-stats">
        <span className="draft-side-stat">🪙 {budget}</span>
        <span className="draft-side-stat">{pieceCount} / {maxPieces} фигур</span>
      </div>
      <div className="draft-roster-items">
        {cart.length === 0 && <span className="draft-roster-empty">пока пусто</span>}
        {cart.map((t, i) => (
          <span
            key={`${targetKey(t)}-${i}`}
            className={`draft-roster-chip${t.kind === 'card' ? ' card' : ''}`}
            style={t.kind === 'card' ? { '--accent': CARD_DEFS[t.cardId].accent } : undefined}
            title={t.kind === 'piece' ? PIECE_LABEL[t.pieceType] : CARD_DEFS[t.cardId].name}
          >
            {t.kind === 'piece' ? PIECE_GLYPHS[color][t.pieceType] : CARD_DEFS[t.cardId].glyph}
          </span>
        ))}
      </div>
    </div>
  )
}
