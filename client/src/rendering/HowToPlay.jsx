import { t } from '../i18n'
import { useEffect, useState } from 'react'
import { CARD_DEFS } from '../game/cards'
import { BOARD_PATTERNS, boardName } from '../game/boardPatterns'
import { BUDGET_BY_ROUND, DRAFT_TIME_BY_ROUND, TIME_LIMIT_BY_ROUND, TIME_INCREMENT_BY_ROUND } from '../game/draftPools'
import BoardThumbnail from './BoardThumbnail'
import { Piece, CardIcon } from '../skins/Piece'
import { IconClose } from './ui/Icons'
import Overlay from './ui/Overlay'
import './HowToPlay.css'

// Tiny 4×4 illustration boards for the "Партия" steps.
function Mini({ cells }) {
  return (
    <div className="htp-mini">
      {Array.from({ length: 16 }, (_, i) => {
        const r = Math.floor(i / 4), c = i % 4
        const cell = cells[i] ?? {}
        return (
          <span key={i} className={`htp-mini-cell${(r + c) % 2 ? ' d' : ''}${cell.home ? ' home' : ''}${cell.sel ? ' sel' : ''}`}>
            {cell.p && <Piece type={cell.p[0]} color={cell.p[1]} size="78%" center className={cell.ghost ? 'ghost' : ''} />}
            {cell.dot && <i className="htp-mini-dot" />}
          </span>
        )
      })}
    </div>
  )
}

const STEP_BOARDS = [
  { cells: { 1: { p: ['king', 'white'] }, 8: { home: true }, 9: { home: true }, 10: { home: true, p: ['knight', 'black'], ghost: true }, 11: { home: true }, 12: { home: true }, 13: { home: true, p: ['king', 'black'] }, 14: { home: true }, 15: { home: true } }, badge: 'coin' },
  { cells: { 0: { p: ['rook', 'white'] }, 2: { p: ['king', 'white'] }, 4: { dot: true }, 6: { dot: true }, 11: { dot: true }, 13: { p: ['knight', 'black'], sel: true } }, badge: 'card' },
  { cells: { 5: { p: ['king', 'white'], sel: true }, 10: { p: ['queen', 'black'] }, 12: { p: ['king', 'black'] } }, badge: 'hearts' },
]

function GameTab() {
  const steps = [
    { title: t('htp.step1Title'), desc: t('htp.step1Desc') },
    { title: t('htp.step2Title'), desc: t('htp.step2Desc') },
    { title: t('htp.step3Title'), desc: t('htp.step3Desc') },
  ]
  return (
    <>
      <div className="htp-steps">
        {steps.map((s, i) => (
          <div className="htp-step" key={i}>
            <div className="htp-step-art">
              <Mini cells={STEP_BOARDS[i].cells} />
              {STEP_BOARDS[i].badge === 'coin' && <span className="htp-badge coin"><span className="ui-coin" />11</span>}
              {STEP_BOARDS[i].badge === 'card' && <span className="htp-badge card"><CardIcon id="meteor" size={34} radius={8} iconScale={0.6} /></span>}
              {STEP_BOARDS[i].badge === 'hearts' && <span className="htp-badge hearts"><i className="on" /><i /></span>}
            </div>
            <div className="htp-step-body">
              <div className="htp-step-title"><span className="htp-num">{i + 1}</span>{s.title}</div>
              <p className="htp-step-desc">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="htp-rounds-head"><b>{t('htp.rounds')}</b><span>{t('htp.roundsSub')}</span></div>
      <div className="htp-rounds">
        {[1, 2, 3].map(r => (
          <div className="htp-round" key={r}>
            <span className="ui-badge-round">{t('score.roundShort', { n: r })}</span>
            <span className="htp-round-thumb"><BoardThumbnail boardPattern={BOARD_PATTERNS[r][0]} cellSize={9} /></span>
            <span className="htp-round-size">{BOARD_PATTERNS[r][0].cols}×{BOARD_PATTERNS[r][0].rows}</span>
            <span className="htp-round-row" title={t('htp.coins')}><span className="ui-coin" /><b className="ui-num">{BUDGET_BY_ROUND[r]}</b></span>
            <span className="htp-round-row" title={t('htp.recruitTime')}><span className="htp-ic">⧗</span><b className="ui-num">{t('htp.sec', { n: DRAFT_TIME_BY_ROUND[r] })}</b></span>
            <span className="htp-round-row" title={t('htp.clock')}><span className="htp-ic">◷</span><b className="ui-num">{t('htp.clockValue', { m: Math.round(TIME_LIMIT_BY_ROUND[r] / 60), s: TIME_INCREMENT_BY_ROUND[r] })}</b></span>
          </div>
        ))}
      </div>
    </>
  )
}

function useCols() {
  const q = '(max-width: 600px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow ? 2 : 4
}

function CardsTab() {
  const cols = useCols()
  const cards = Object.values(CARD_DEFS)
  const [sel, setSel] = useState(null)
  const selIdx = cards.findIndex(c => c.id === sel)
  const rowEnd = selIdx < 0 ? -1 : Math.min(cards.length - 1, Math.floor(selIdx / cols) * cols + cols - 1)
  return (
    <div className="htp-cards" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {cards.map((c, i) => (
        <button key={c.id} data-tilt className={`htp-card${sel === c.id ? ' sel' : ''}`} style={{ order: i * 2 }} onClick={() => setSel(sel === c.id ? null : c.id)} aria-expanded={sel === c.id}>
          <span className="htp-card-art"><CardIcon id={c.id} size={80} radius={10} iconScale={0.5} /></span>
          <span className="htp-card-q">?</span>
          <span className="htp-card-price">{c.cost}</span>
          <span className="htp-card-name">{c.name}</span>
        </button>
      ))}
      {selIdx >= 0 && (
        <div className="htp-card-desc" style={{ order: rowEnd * 2 + 1, '--arrow': `${((selIdx % cols) + 0.5) / cols * 100}%` }}>
          <b>{cards[selIdx].name}.</b> {cards[selIdx].desc}
        </div>
      )}
    </div>
  )
}

function BoardsTab() {
  return (
    <div className="htp-boards">
      {Object.entries(BOARD_PATTERNS).map(([round, patterns]) => (
        <div className="htp-boards-round" key={round}>
          <div className="htp-boards-head">
            <span className="ui-badge-round">{t('score.roundShort', { n: round })}</span>
            <span>{patterns[0].cols}×{patterns[0].rows}</span>
          </div>
          <div className="htp-boards-grid">
            {patterns.map(p => (
              <div className="htp-board" key={p.id}>
                <span className="htp-board-thumb"><BoardThumbnail boardPattern={p} cellSize={11} /></span>
                <span className="htp-board-name">{boardName(p)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="htp-boards-note">{t('htp.boardsNote')}</p>
    </div>
  )
}

export default function HowToPlay({ onClose }) {
  const [tab, setTab] = useState('game')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const tabs = [
    { id: 'game', label: t('htp.tabGame') },
    { id: 'cards', label: t('htp.tabCards') },
    { id: 'boards', label: t('htp.tabBoards') },
  ]
  return (
    <Overlay onClose={onClose}>
      <div className="ui-modal htp-card-modal" role="dialog" aria-label={t('htp.title')} onClick={e => e.stopPropagation()}>
        <span className="htp-grab" aria-hidden="true" />
        <div className="htp-head">
          <h2 className="ui-modal-title">{t('htp.title')}</h2>
          <button className="ui-btn icon" onClick={onClose} aria-label={t('common.close')}><IconClose /></button>
        </div>
        <div className="ui-seg htp-tabs" role="tablist">
          {tabs.map(tb => (
            <button key={tb.id} role="tab" aria-selected={tab === tb.id} className={tab === tb.id ? 'on' : ''} onClick={() => setTab(tb.id)}>{tb.label}</button>
          ))}
        </div>
        <div className="htp-content ui-scroll">
          {tab === 'game' && <GameTab />}
          {tab === 'cards' && <CardsTab />}
          {tab === 'boards' && <BoardsTab />}
        </div>
      </div>
    </Overlay>
  )
}
