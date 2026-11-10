import { t } from '../../i18n'
import { boardName } from '../../game/boardPatterns'
import { IconBack, IconExit } from '../ui/Icons'
import './match.css'

// Shared frame of the recruit and battle screens — same geometry in both,
// so moving from recruit to battle doesn't move the board. Desktop: three
// columns (players + journal | board | cards). Portrait: opponent, board,
// you, cards tray. One set of elements; match.css re-flows them.
export default function MatchLayout({
  phase,               // 'recruit' | 'battle' | 'sandbox'
  round, boardPattern, title,
  actions, onBack,
  opp, me, log, board, boardOverlay, right, tray, children, className = '',
}) {
  const size = boardPattern ? `${boardPattern.cols}×${boardPattern.rows}` : ''
  const bName = boardPattern?.id ? boardName(boardPattern) : ''
  const sub = [bName, size].filter(Boolean).join(' · ')
  return (
    <div className={`mx-screen ${phase} ${className}`}>
      <header className="mx-header">
        <div className="mx-header-left">
          {onBack && (
            <button className="ui-btn icon" onClick={onBack} aria-label={t('common.exit')} title={t('common.exit')} data-testid="exit-btn">
              {phase === 'sandbox' ? <IconBack /> : <IconExit size={22} />}
            </button>
          )}
          <div className="mx-logo">CHESS<span>+</span></div>
          <div className="mx-title-compact">
            <div className="mx-title-row">
              {round != null && <span className="ui-badge-round sm">{t('score.roundShort', { n: round })}</span>}
              <span className="mx-title-phase">{title ?? t(phase === 'recruit' ? 'phase.recruit' : phase === 'battle' ? 'phase.battle' : 'menu.sandbox')}</span>
            </div>
            {sub && <span className="mx-title-sub">{sub}</span>}
          </div>
        </div>
        <div className="mx-pill">
          {round != null && <span className="ui-badge-round">{t('score.roundShort', { n: round })}</span>}
          {phase === 'sandbox'
            ? <span className="mx-pill-on">{title ?? t('menu.sandbox')}</span>
            : (
              <>
                <span className={phase === 'recruit' ? 'mx-pill-on' : 'mx-pill-off'}>{t('phase.recruit')}</span>
                <span className="mx-pill-sep">›</span>
                <span className={phase === 'battle' ? 'mx-pill-on' : 'mx-pill-off'}>{t('phase.battle')}</span>
              </>
            )}
          {sub && <><span className="mx-pill-div" /><span className="mx-pill-board">{sub}</span></>}
        </div>
        <div className="mx-actions">{actions}</div>
      </header>

      <div className="mx-body">
        <div className="mx-opp">{opp}</div>
        {log}
        <main className="mx-board">
          {board}
          {boardOverlay}
        </main>
        <div className="mx-me">{me}</div>
        {right && <aside className="mx-right">{right}</aside>}
        {tray && <div className="mx-tray ui-panel">{tray}</div>}
      </div>
      {children}
    </div>
  )
}
