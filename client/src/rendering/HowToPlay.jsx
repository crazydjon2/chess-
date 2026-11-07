import { t } from '../i18n'
import { useState } from 'react'
import { CARD_DEFS } from '../game/cards'
import { BOARD_PATTERNS, boardName } from '../game/boardPatterns'
import { TIME_LIMIT_BY_ROUND, TIME_INCREMENT_BY_ROUND, PLACEMENT_TIME_BY_ROUND, DRAFT_TIME_BY_ROUND } from '../game/draftPools'
import BoardThumbnail from './BoardThumbnail'
import './HowToPlay.css'

// Minutes per round, derived from the real constant so this copy can't go
// stale the next time TIME_LIMIT_BY_ROUND gets tuned.
const CLOCK_MINUTES = [1, 2, 3].map(r => Math.round(TIME_LIMIT_BY_ROUND[r] / 60)).join('/')
const CLOCK_INCREMENT = [1, 2, 3].map(r => TIME_INCREMENT_BY_ROUND[r]).join('/')
const PLACEMENT_SECONDS = [1, 2, 3].map(r => PLACEMENT_TIME_BY_ROUND[r]).join('/')
const DRAFT_SECONDS = [1, 2, 3].map(r => DRAFT_TIME_BY_ROUND[r]).join('/')

// Generic, hand-drawn step icons (not tied to live game state) — same
// felt-card visual language as MainMenu/PatchNotes. Real content (card
// list, board list) still reads straight off the game's own data below;
// only these four illustrate a fixed idea and never go stale.
function DraftIcon() {
  return (
    <div className="htp-step-icon htp-step-icon-draft">
      <span className="htp-mini-card gold" />
      <span className="htp-mini-card red" />
      <span className="htp-mini-coin" />
    </div>
  )
}

function PlacementIcon() {
  return (
    <div className="htp-step-icon htp-checker">
      <div className="htp-hidden-half">?</div>
      <div className="htp-piece-dots">
        <span /><span /><span /><span />
      </div>
    </div>
  )
}

function BattleIcon() {
  return (
    <div className="htp-step-icon htp-checker">
      <span className="htp-battle-piece dark" />
      <span className="htp-battle-move" style={{ top: 14, left: 36 }} />
      <span className="htp-battle-move" style={{ top: 32, left: 22 }} />
      <span className="htp-battle-piece cream" />
    </div>
  )
}

function RoundResultIcon() {
  return (
    <div className="htp-step-icon htp-step-icon-result">
      <div className="htp-score-pips">
        <span className="filled" />
        <span />
      </div>
      <span className="htp-score-label">{t('htp.twoWins')}</span>
    </div>
  )
}

const getSteps = () => [
  {
    title: t('htp.draftTitle'),
    Icon: DraftIcon,
    desc: t('htp.draftDesc', { sec: DRAFT_SECONDS }),
  },
  {
    title: t('htp.placementTitle'),
    Icon: PlacementIcon,
    desc: t('htp.placementDesc', { sec: PLACEMENT_SECONDS }),
  },
  {
    title: t('htp.battleTitle'),
    Icon: BattleIcon,
    desc: t('htp.battleDesc', { min: CLOCK_MINUTES, inc: CLOCK_INCREMENT }),
  },
  {
    title: t('htp.resultTitle'),
    Icon: RoundResultIcon,
    desc: t('htp.resultDesc'),
  },
]

const getTabs = () => [
  { id: 'general', label: t('htp.tabGeneral') },
  { id: 'spells',  label: t('htp.tabSpells') },
  { id: 'boards',  label: t('htp.tabBoards') },
]

function GeneralTab() {
  return (
    <div className="htp-steps">
      {getSteps().map((step, i) => (
        <div className="htp-step" key={step.title}>
          <div className="htp-step-icon-wrap">
            <step.Icon />
            <span className="htp-step-number">{i + 1}</span>
          </div>
          <div className="htp-step-body">
            <div className="htp-step-title">{step.title}</div>
            <div className="htp-step-desc">{step.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SpellsTab() {
  return (
    <div className="htp-cards">
      {Object.values(CARD_DEFS).map(card => (
        <div className="htp-card-chip" key={card.id}>
          <span className="htp-card-glyph" style={{ background: card.accent }}>{card.glyph}</span>
          <div className="htp-card-info">
            <span className="htp-card-name">{card.name}</span>
            <span className="htp-card-desc">{card.desc.replace(/\n/g, ' ')}</span>
          </div>
          <span className="htp-card-cost">
            <span className="htp-card-coin" />
            {card.cost}
          </span>
        </div>
      ))}
    </div>
  )
}

function BoardsTab() {
  return (
    <div className="htp-boards">
      {Object.entries(BOARD_PATTERNS).map(([round, patterns]) => (
        <div className="htp-boards-round" key={round}>
          <div className="htp-boards-round-title">{t('common.round', { n: round })}</div>
          <div className="htp-boards-grid">
            {patterns.map(pattern => (
              <div className="htp-board-chip" key={pattern.id}>
                <div className="htp-board-thumb-wrap">
                  <BoardThumbnail boardPattern={pattern} cellSize={8} />
                </div>
                <span className="htp-board-name">{boardName(pattern)}</span>
                <span className="htp-board-dims">{pattern.rows}×{pattern.cols}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function HowToPlay({ onClose }) {
  const [tab, setTab] = useState('general')

  return (
    <div className="htp-overlay" onClick={onClose}>
      <div className="htp-card" onClick={e => e.stopPropagation()}>
        <div className="htp-header">
          <span className="htp-title">{t('htp.title')}</span>
          <button className="htp-close" onClick={onClose} title={t('common.close')}>✕</button>
        </div>

        <div className="htp-tabs">
          {getTabs().map(tb => (
            <button
              key={tb.id}
              className={`htp-tab${tab === tb.id ? ' active' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="htp-content">
          {tab === 'general' && <GeneralTab />}
          {tab === 'spells' && <SpellsTab />}
          {tab === 'boards' && <BoardsTab />}
        </div>
      </div>
    </div>
  )
}
