import { t } from '../../i18n'
import Overlay from '../ui/Overlay'
import { Piece } from '../../skins/Piece'

// Round / match result over the frozen board: crown with rays, title,
// both players with the running score, the next step.
export default function ResultModal({
  title, reason, outcome = 'draw', // 'win' | 'loss' | 'draw'
  me, opp,                          // { color, name, score }
  roundsToWin = 2, showDots = true,
  primary, secondary, note,         // primary/secondary: { label, onClick, disabled, countdownMs }
}) {
  const side = (p, mine) => (
    <div className="rs-side">
      <span className={`ui-avatar ${p.color}`}><Piece type="king" color={p.color} size={40} center /></span>
      <span className="rs-side-name">{p.name}</span>
      {showDots && (
        <span className="rs-dots" aria-hidden="true">
          {Array.from({ length: roundsToWin }, (_, i) => <i key={i} className={i < p.score ? 'on' : ''} />)}
        </span>
      )}
      <span className="sr-only">{mine ? t('common.you') : t('common.opponent')}</span>
    </div>
  )
  return (
    <Overlay sheet={false}>
      <div className="ui-modal rs-card" role="dialog" aria-label={title}>
        <div className={`rs-crown ${outcome}`}>
          <Piece type="king" color={outcome === 'loss' ? opp.color : me.color} size={44} center />
        </div>
        <h2 className="rs-title">{title}</h2>
        {reason && <p className="rs-reason">{reason}</p>}
        <div className="rs-score">
          {side(me, true)}
          <div className="rs-nums"><span className="me">{me.score}</span><span>:</span><span>{opp.score}</span></div>
          {side(opp, false)}
        </div>
        <div className="ui-modal-actions" style={{ marginTop: 0 }}>
          {secondary && <button className="ui-btn" onClick={secondary.onClick} disabled={secondary.disabled}>{secondary.label}</button>}
          {primary && (
            <button className="ui-btn primary rs-next" onClick={primary.onClick} disabled={primary.disabled} data-testid="result-primary">
              {primary.label}
              {primary.countdownMs > 0 && <span className="rs-next-bar" style={{ animationDuration: `${primary.countdownMs}ms` }} />}
            </button>
          )}
        </div>
        {note && <p className="rs-note">{note}</p>}
      </div>
    </Overlay>
  )
}
