import { useState } from 'react'
import { CARD_DEFS } from '../game/cards'
import { PIECE_GLYPHS } from '../game/economy'
import { BOARD_PATTERNS } from '../game/boardPatterns'
import { TIME_LIMIT_BY_ROUND } from '../game/draftPools'
import BoardThumbnail from './BoardThumbnail'
import './HowToPlay.css'

// Minutes per round, derived from the real constant so this copy can't go
// stale the next time TIME_LIMIT_BY_ROUND gets tuned.
const CLOCK_MINUTES = [1, 2, 3].map(r => Math.round(TIME_LIMIT_BY_ROUND[r] / 60)).join('/')

// Miniature mockups of each phase's actual screen — small CSS/glyph
// illustrations rather than plain emoji, so a player can recognize the real
// UI when they get there instead of just reading a description.

function DraftDiagram() {
  return (
    <div className="htp-diagram htp-diagram-draft">
      <div className="htp-draft-pool">
        <span className="htp-draft-tile piece">{PIECE_GLYPHS.white.pawn}</span>
        <span className="htp-draft-tile piece banned">{PIECE_GLYPHS.white.queen}</span>
        <span className="htp-draft-tile piece">{PIECE_GLYPHS.white.knight}</span>
        <span className="htp-draft-tile card" style={{ '--accent': '#d35400' }}>☄</span>
        <span className="htp-draft-tile card banned" style={{ '--accent': '#2980b9' }}>❄</span>
      </div>
    </div>
  )
}

function PlacementDiagram() {
  const hiddenRow = Array.from({ length: 4 })
  const myBack  = ['rook', 'knight', 'bishop', 'king']
  const myFront = ['pawn', 'pawn', 'pawn', 'pawn']
  return (
    <div className="htp-diagram htp-diagram-placement">
      <div className="htp-mini-board">
        {hiddenRow.map((_, i) => <span key={`h1-${i}`} className="htp-mini-cell hidden">?</span>)}
        {hiddenRow.map((_, i) => <span key={`h2-${i}`} className="htp-mini-cell hidden">?</span>)}
        {myBack.map((t, i) => <span key={`b-${i}`} className="htp-mini-cell mine">{PIECE_GLYPHS.white[t]}</span>)}
        {myFront.map((t, i) => <span key={`f-${i}`} className="htp-mini-cell mine">{PIECE_GLYPHS.white[t]}</span>)}
      </div>
    </div>
  )
}

function BattleDiagram() {
  return (
    <div className="htp-diagram htp-diagram-battle">
      <div className="htp-mini-board battle">
        <span className="htp-mini-cell opp">{PIECE_GLYPHS.black.knight}</span>
        <span className="htp-mini-cell empty" />
        <span className="htp-mini-cell target-capture">{PIECE_GLYPHS.black.pawn}</span>
        <span className="htp-mini-cell empty" />

        <span className="htp-mini-cell empty" />
        <span className="htp-mini-cell target-move" />
        <span className="htp-mini-cell empty" />
        <span className="htp-mini-cell empty" />

        <span className="htp-mini-cell empty" />
        <span className="htp-mini-cell empty" />
        <span className="htp-mini-cell mine">{PIECE_GLYPHS.white.bishop}</span>
        <span className="htp-mini-cell empty" />
      </div>
      <span className="htp-battle-coin">+3🪙</span>
    </div>
  )
}

function RoundResultDiagram() {
  return (
    <div className="htp-diagram htp-diagram-round">
      <span className="htp-round-trophy">🏆</span>
      <span className="htp-round-score">Раунд 2 · 1&nbsp;:&nbsp;0</span>
      <div className="htp-round-carry">
        <span className="htp-carry-piece">{PIECE_GLYPHS.white.bishop}</span>
        <span className="htp-carry-piece">{PIECE_GLYPHS.white.pawn}</span>
        <span className="htp-carry-arrow">➜</span>
        <span className="htp-carry-label">раунд 3</span>
      </div>
    </div>
  )
}

const STEPS = [
  {
    title: '1. Драфт',
    Diagram: DraftDiagram,
    desc: 'Сначала оба игрока вслепую банят друг другу несколько фигур и карт (пешку забанить нельзя). Затем баны раскрываются, и на оставшийся бюджет можно закупить что угодно — фигуры и карты не ограничены количеством, всё зависит только от золота и банов.',
  },
  {
    title: '2. Расстановка',
    Diagram: PlacementDiagram,
    desc: 'Ставите свои фигуры на первых двух рядах. Соперник вашу расстановку не видит, пока оба не нажмут «Готово».',
  },
  {
    title: '3. Бой',
    Diagram: BattleDiagram,
    desc: `Ходите по очереди, карта — это отдельный ход вместо обычного. У каждого свои часы (${CLOCK_MINUTES} мин по раундам), тикают только на вашем ходу — если время выйдет, раунд проигран сразу, независимо от того, что осталось на доске. За съеденную фигуру соперника капают монеты — но это деньги только этого раунда, они не переходят в следующий драфт.`,
  },
  {
    title: '4. Итог раунда',
    Diagram: RoundResultDiagram,
    desc: 'Короля нет — побеждает тот, кто уничтожит армию соперника целиком, у кого выйдет время у соперника, или у кого совсем не останется ходов — в любом из этих случаев раунд сразу проигран, независимо от того, что осталось на доске. Матч — до 2 побед; в следующий раунд переходят только уцелевшие фигуры и неиспользованные карты — деньги каждый раунд начинаются заново.',
  },
]

const TABS = [
  { id: 'general', label: 'Общее' },
  { id: 'spells',  label: 'Заклинания' },
  { id: 'boards',  label: 'Карты' },
]

function GeneralTab() {
  return (
    <div className="htp-steps">
      {STEPS.map(step => (
        <div className="htp-step" key={step.title}>
          <step.Diagram />
          <div className="htp-step-title">{step.title}</div>
          <div className="htp-step-desc">{step.desc}</div>
        </div>
      ))}
    </div>
  )
}

function SpellsTab() {
  return (
    <div className="htp-cards">
      {Object.values(CARD_DEFS).map(card => (
        <div className="htp-card-chip" key={card.id} style={{ '--accent': card.accent }}>
          <span className="htp-card-glyph">{card.glyph}</span>
          <div className="htp-card-info">
            <span className="htp-card-name">{card.name}</span>
            <span className="htp-card-desc">{card.desc.replace(/\n/g, ' ')}</span>
          </div>
          <span className="htp-card-cost">{card.cost}🪙</span>
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
          <div className="htp-boards-round-title">Раунд {round}</div>
          <div className="htp-boards-grid">
            {patterns.map(pattern => (
              <div className="htp-board-chip" key={pattern.name}>
                <BoardThumbnail boardPattern={pattern} cellSize={10} />
                <span className="htp-board-name">{pattern.name}</span>
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
        <button className="htp-close" onClick={onClose} title="Закрыть">✕</button>
        <div className="htp-title">Как играть</div>
        <div className="htp-subtitle">Дуэль до 2 побед. Каждый раунд — новый набор фигур и карт.</div>

        <div className="htp-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`htp-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' && <GeneralTab />}
        {tab === 'spells' && <SpellsTab />}
        {tab === 'boards' && <BoardsTab />}
      </div>
    </div>
  )
}
