// Recruit ("Набор"): draft + placement in one turn-based phase. On your
// turn you either tap a free square of your half and buy a piece straight
// onto it (picker popover over the square) or buy a card from the shop.
// Your first action is always placing your king (free, final). Everything is visible to
// both players live; the battle starts on this same board when both are done.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t, playerName } from '../i18n'
import MatchLayout from './match/MatchLayout'
import PlayerCard from './match/PlayerCard'
import { RecruitLog } from './match/Journal'
import { CardRow, CardTile, TrayPopover } from './match/Cards'
import BoardView from './board/BoardView'
import { SettingsButton } from './Settings'
import { Piece } from '../skins/Piece'
import { IconCheck } from './ui/Icons'
import { nextItemCost, freeHomeSquares, isDraftComplete, hasKing, ALL_PIECE_TYPES, ALL_CARD_IDS } from '../game/draftEngine'
import { play } from '../sound'

const other = c => (c === 'white' ? 'black' : 'white')

function piecesOf(placed) {
  const out = {}
  ;['white', 'black'].forEach(color => {
    Object.entries(placed?.[color] ?? {}).forEach(([sq, type]) => { out[sq] = { type, color, hp: type === 'king' ? 2 : 1 } })
  })
  return out
}

// Fixed-position popover anchored above (or below) a board square.
function useSquareAnchor(square, deps) {
  const [anchor, setAnchor] = useState(null)
  useLayoutEffect(() => {
    if (!square) { setAnchor(null); return }
    const measure = () => {
      const el = document.querySelector(`.mx-board .bd-cell[data-square="${square}"]`)
      if (!el) { setAnchor(null); return }
      const r = el.getBoundingClientRect()
      setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [square, ...deps])
  return anchor
}

function PiecePicker({ anchor, options, pickType, onType, onConfirm, confirmLabel }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const vw = window.innerWidth
    const below = anchor.top - h - 14 < 8
    const left = Math.min(vw - w / 2 - 8, Math.max(w / 2 + 8, anchor.cx))
    setPos({ left, top: below ? anchor.bottom + 12 : anchor.top - 12, below, arrow: anchor.cx - left })
  }, [anchor])
  if (!anchor) return null
  return (
    <div
      ref={ref}
      className={`pk-pop${pos?.below ? ' below' : ''}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      role="dialog"
      aria-label={t('recruit.pickPiece')}
      onClick={e => e.stopPropagation()}
    >
      {options.map(o => (
        <button
          key={o.type}
          type="button"
          className={`pk-opt${pickType === o.type ? ' on' : ''}`}
          disabled={o.disabled}
          aria-pressed={pickType === o.type}
          aria-label={`${o.label}, ${o.cost}`}
          data-piece-type={o.type}
          onClick={() => onType(o.type)}
          onDoubleClick={() => !o.disabled && onConfirm(o.type)}
        >
          <Piece type={o.type} color={o.color} size={46} center />
          <span className="pk-opt-price">{o.cost === 0 ? t('recruit.free') : <>{!o.disabled && <span className="ui-coin sm" />}{o.cost}</>}</span>
        </button>
      ))}
      <span className="pk-sep" aria-hidden="true" />
      <button type="button" className="pk-ok" disabled={!pickType} onClick={() => onConfirm(pickType)} aria-label={confirmLabel} data-testid="recruit-confirm">
        <IconCheck />
      </button>
      {pos && <span className="pk-arrow" style={{ left: `calc(50% + ${pos.arrow}px)` }} aria-hidden="true" />}
    </div>
  )
}

export default function RecruitPhase({ match, myColor, room, onPick, onDone, onExit }) {
  const ds = match.draft
  const opp = other(myColor)
  const names = {
    white: playerName(room?.players?.white) || t('common.white'),
    black: playerName(room?.players?.black) || t('common.black'),
  }
  const finished = isDraftComplete(ds)
  const started = ds.turnStartedAt != null
  const myTurn = started && !finished && ds.turn === myColor && !ds.done[myColor]
  const pieces = piecesOf(ds.placed)
  const free = freeHomeSquares(ds, myColor)
  const needKing = !hasKing(ds, myColor)
  const budget = ds.budgets[myColor]
  const myCount = ds.picks[myColor].pieces.length

  const [cell, setCell] = useState(null)
  const [pickType, setPickType] = useState(null)
  const [cardSel, setCardSel] = useState(null)

  // Anything half-chosen is dropped once the turn moves on.
  useEffect(() => { setCell(null); setCardSel(null) }, [myTurn, ds.log?.length])

  const pieceOptions = needKing
    ? [{ type: 'king', color: myColor, cost: 0, label: t('piece.king'), disabled: false }]
    : ALL_PIECE_TYPES.map(type => {
    const cost = nextItemCost(ds, myColor, { kind: 'piece', pieceType: type })
    return { type, color: myColor, cost, label: t(`piece.${type}`), disabled: cost > budget || myCount >= ds.maxPieces }
  })

  function openCell(sq) {
    setCell(sq)
    setCardSel(null)
    const keep = pieceOptions.find(o => o.type === pickType && !o.disabled)
    setPickType(keep ? keep.type : (pieceOptions.find(o => !o.disabled)?.type ?? null))
  }

  function handleSquare(sq) {
    if (!myTurn) return
    if (free.includes(sq)) {
      if (sq === cell) { setCell(null); return }
      play('select')
      openCell(sq)
      return
    }
    setCell(null)
  }

  function confirmPiece(type) {
    if (!cell || !type) return
    onPick({ kind: 'piece', pieceType: type, square: cell })
    setCell(null)
  }

  function buyCard(id) {
    onPick({ kind: 'card', cardId: id })
    setCardSel(null)
  }

  const anchor = useSquareAnchor(cell, [ds.log?.length])

  // Esc closes whatever is open.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { setCell(null); setCardSel(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const highlights = myTurn ? free.map(sq => ({ square: sq, kind: 'home' })) : []
  const clockFor = color => ({
    seconds: ds.clocks?.[color],
    startedAt: ds.turnStartedAt,
    ticking: started && !finished && ds.turn === color && !ds.done[color],
  })
  const cardList = ALL_CARD_IDS.map(id => {
    const cost = nextItemCost(ds, myColor, { kind: 'card', cardId: id })
    return { id, cost, disabled: !myTurn || needKing || cost > budget }
  })

  const playerCard = (color, side) => (
    <PlayerCard
      side={side}
      color={color}
      name={names[color]}
      active={started && !finished && ds.turn === color && !ds.done[color]}
      clock={clockFor(color)}
      score={match.scores[color]}
      recruit={{ coins: ds.budgets[color], pieces: ds.picks[color].pieces.length, maxPieces: ds.maxPieces }}
      cards={ds.picks[color].cards.map(id => ({ id }))}
      emptyCardsLabel={t(side === 'me' ? 'recruit.noCardsYet' : 'recruit.noCards')}
    />
  )

  const selectedCard = cardList.find(c => c.id === cardSel)

  return (
    <MatchLayout
      phase="recruit"
      onBack={onExit}
      round={match.round}
      boardPattern={match.boardPattern}
      actions={(
        <>
          <SettingsButton />
          <button className="ui-btn keep-lbl" disabled={!myTurn || needKing} onClick={() => { setCell(null); onDone() }} data-testid="recruit-done">
            <span className="lbl">{t('common.done')}</span>
          </button>
        </>
      )}
      opp={playerCard(opp, 'opp')}
      me={playerCard(myColor, 'me')}
      log={<RecruitLog log={ds.log} names={names} turnColor={ds.turn} myColor={myColor} finished={finished} />}
      board={(
        <div className="mx-board-click" onClick={e => { if (e.target === e.currentTarget) setCell(null) }} style={{ position: 'absolute', inset: 0 }}>
          <BoardView
            rows={match.boardPattern.rows}
            cols={match.boardPattern.cols}
            blockedCells={match.boardPattern.blockedCells ?? []}
            pieces={pieces}
            flipped={myColor === 'black'}
            highlights={highlights}
            outlines={cell ? [{ square: cell, kind: 'target' }] : []}
            ghost={cell && pickType ? { square: cell, type: pickType, color: myColor } : null}
            interactive={myTurn}
            onSquareClick={handleSquare}
            testAttrs={{ 'data-testid': 'board', 'data-mode': needKing ? 'king' : 'recruit', 'data-my-turn': myTurn ? '1' : '', 'data-targets': myTurn ? free.join(' ') : '' }}
          />
        </div>
      )}
      boardOverlay={(
        <>
          {!started && match.summaryReady && (
            <div className="mx-banner"><span className="mx-banner-text">{t('common.waitingOpponent')}</span></div>
          )}
          {started && myTurn && needKing && !cell && (
            <div className="mx-hint" role="status">{t('recruit.placeKing')}</div>
          )}
        </>
      )}
      right={(
        <section className="cd-panel ui-panel grow" aria-label={t('recruit.shop')}>
          <div className="cd-panel-head">{t('battle.cards')}</div>
          <div className="cd-panel-list ui-scroll">
            {cardList.map(c => (
              <CardRow
                key={c.id}
                id={c.id}
                price={c.cost}
                disabled={c.disabled && cardSel !== c.id}
                selected={cardSel === c.id}
                showDesc={cardSel === c.id}
                onClick={() => { play('select'); setCell(null); setCardSel(cardSel === c.id ? null : c.id) }}
                action={cardSel === c.id ? (
                  <button className="ui-btn primary cd-buy" disabled={c.disabled} onClick={e => { e.stopPropagation(); buyCard(c.id) }} data-testid="buy-card">
                    {t('recruit.buy', { n: c.cost })}
                  </button>
                ) : undefined}
              />
            ))}
          </div>
        </section>
      )}
      tray={(
        <>
          {selectedCard && (
            <TrayPopover
              id={selectedCard.id}
              actionLabel={t('recruit.buy', { n: selectedCard.cost })}
              actionDisabled={selectedCard.disabled}
              onAction={() => buyCard(selectedCard.id)}
              onClose={() => setCardSel(null)}
            />
          )}
          <div className="mx-tray-strip">
            {cardList.map(c => (
              <CardTile
                key={c.id}
                id={c.id}
                price={c.cost}
                selected={cardSel === c.id}
                disabled={c.disabled}
                onClick={() => { play('select'); setCell(null); setCardSel(cardSel === c.id ? null : c.id) }}
              />
            ))}
          </div>
        </>
      )}
    >
      {cell && myTurn && (
        <PiecePicker
          anchor={anchor}
          options={pieceOptions}
          pickType={pickType}
          onType={setPickType}
          onConfirm={confirmPiece}
          confirmLabel={t('recruit.buyPlace')}
        />
      )}
    </MatchLayout>
  )
}
