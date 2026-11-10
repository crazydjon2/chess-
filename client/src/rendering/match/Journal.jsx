import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { Piece, CardIcon } from '../../skins/Piece'
import { CARD_DEFS } from '../../game/cards'
import { PIECE_LABEL } from '../../game/economy'
import { IconChevron } from '../ui/Icons'

const other = c => (c === 'white' ? 'black' : 'white')

function RecruitRow({ e, n, names }) {
  if (e.kind === 'done') {
    return (
      <div className="jr-row">
        <span className="jr-n">{n}</span>
        <span className="jr-text"><b>{names[e.color]}</b> · {t(e.timeout ? 'recruit.logTimeout' : 'recruit.logDone')}</span>
      </div>
    )
  }
  return (
    <div className="jr-row">
      <span className="jr-n">{n}</span>
      {e.kind === 'piece'
        ? <Piece type={e.pieceType} color={e.color} size={20} thin />
        : <CardIcon id={e.cardId} size={20} radius={5} iconScale={0.7} />}
      <span className="jr-text">
        <b>{names[e.color]}</b> · {e.kind === 'piece'
          ? (e.square ? t('recruit.logPieceOn', { piece: PIECE_LABEL[e.pieceType], square: e.square }) : PIECE_LABEL[e.pieceType])
          : CARD_DEFS[e.cardId]?.name}
      </span>
      <span className="jr-price ui-num">{e.cost}</span>
    </div>
  )
}

function TurnRow({ n, mine, label }) {
  return (
    <div className={`jr-row turn${mine ? ' mine' : ''}`}>
      <span className="jr-n">{n}</span>
      <span className="jr-text">{label}</span>
    </div>
  )
}

// "История набора" — the recruit picks, oldest first, then whose turn it is.
export function RecruitLog({ log = [], names, turnColor, myColor, finished }) {
  const listRef = useRef(null)
  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [log.length])
  return (
    <section className="jr ui-panel mx-log" aria-label={t('recruit.history')}>
      <span className="jr-title">{t('recruit.history')}</span>
      <div className="jr-list ui-scroll" ref={listRef}>
        {log.map((e, i) => <RecruitRow key={i} e={e} n={i + 1} names={names} />)}
        {!finished && (
          <TurnRow n={log.length + 1} mine={turnColor === myColor} label={turnColor === myColor ? t('turn.yours') : t('turn.of', { name: names[turnColor] })} />
        )}
      </div>
    </section>
  )
}

function describeMove(entry) {
  const piece = entry.snapshot?.pieces?.[entry.to]
  return { type: piece?.type ?? 'pawn' }
}

// Battle "Журнал": recruit summary (collapsible), then the battle's moves
// and cards. Clicking an entry shows the board as it stood right after it
// (history view); the live row returns to the game.
export function BattleJournal({
  entries = [], draftLog = [], names, myColor, turnColor, finished,
  historyIndex, onSelect, onReturnToLive, className = '',
}) {
  const [showRecruit, setShowRecruit] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const listRef = useRef(null)
  const battle = entries.map((e, i) => ({ e, i })).filter(x => x.e.kind !== 'start')
  useEffect(() => { if (historyIndex == null) listRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [battle.length, historyIndex])

  const KEEP = 6
  const collapsed = !showOld && battle.length > KEEP + 1
  const older = collapsed ? battle.slice(0, battle.length - KEEP) : []
  const visible = collapsed ? battle.slice(battle.length - KEEP) : battle
  const viewing = historyIndex

  const row = ({ e, i }) => {
    const n = i
    const sel = viewing === i
    const live = i === entries.length - 1
    const go = () => (live ? onReturnToLive?.() : onSelect?.(i))
    if (e.kind === 'card') {
      return (
        <button key={i} className={`jr-row btn${sel ? ' sel' : ''}`} onClick={go}>
          <span className="jr-n">{n}</span>
          <CardIcon id={e.cardId} size={20} radius={5} iconScale={0.7} />
          <span className="jr-text"><b>{names[e.color]}</b> · {CARD_DEFS[e.cardId]?.name}</span>
        </button>
      )
    }
    if (e.hidden) {
      return (
        <button key={i} className={`jr-row btn${sel ? ' sel' : ''}`} onClick={go}>
          <span className="jr-n">{n}</span>
          <span className="jr-fog">☁</span>
          <span className="jr-text"><b>{names[e.color]}</b> · {t('log.hiddenShort')}</span>
        </button>
      )
    }
    const { type } = describeMove(e)
    return (
      <button key={i} className={`jr-row btn${sel ? ' sel' : ''}`} onClick={go}>
        <span className="jr-n">{n}</span>
        <Piece type={type} color={e.color} size={20} thin />
        <span className="jr-text"><b>{names[e.color]}</b> · {e.from}{e.capturedType ? '×' : '–'}{e.to}</span>
        {e.capturedType && <Piece type={e.capturedType} color={other(e.color)} size={18} thin />}
      </button>
    )
  }

  return (
    <section className={`jr ui-panel mx-log ${className}`} aria-label={t('log.title')}>
      <span className="jr-title">{t('log.title')}</span>
      <div className="jr-list ui-scroll" ref={listRef}>
        {draftLog.length > 0 && (
          <>
            <button className="jr-row btn group" onClick={() => setShowRecruit(v => !v)} aria-expanded={showRecruit}>
              <span className="jr-n">{draftLog.length}</span>
              <span className="jr-text">{t('log.recruitGroup')}</span>
              <span className={`jr-chev${showRecruit ? ' open' : ''}`}><IconChevron size={16} /></span>
            </button>
            {showRecruit && draftLog.map((e, i) => <RecruitRow key={`r${i}`} e={e} n={i + 1} names={names} />)}
          </>
        )}
        <div className="jr-divider"><span>{t('log.battle')}</span></div>
        {older.length > 0 && (
          <button className="jr-row btn group" onClick={() => setShowOld(true)}>
            <span className="jr-n">{older.at(-1).i}</span>
            <span className="jr-text">{t('log.movesRange', { from: 1, to: older.at(-1).i })}</span>
            <span className="jr-chev"><IconChevron size={16} /></span>
          </button>
        )}
        {visible.map(row)}
        {!finished && (
          <TurnRow n={entries.length} mine={turnColor === myColor} label={turnColor === myColor ? t('turn.yours') : t('turn.of', { name: names[turnColor] })} />
        )}
      </div>
    </section>
  )
}
