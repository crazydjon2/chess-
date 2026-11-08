import { t } from '../../i18n'
import { CardIcon } from '../../skins/Piece'
import { CARD_DEFS } from '../../game/cards'
import { IconClose } from '../ui/Icons'

// Card row (desktop right column): icon, name, price or action.
export function CardRow({ id, price, selected, disabled, used, size = 'big', onClick, action, showDesc }) {
  const def = CARD_DEFS[id]
  return (
    <div
      className={`cd-row ${size}${selected ? ' sel' : ''}${disabled ? ' off' : ''}${used ? ' used' : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={disabled || undefined}
      aria-pressed={onClick ? !!selected : undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={e => { if (onClick && !disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      title={def?.desc}
      data-card={id}
    >
      <CardIcon id={id} size={size === 'big' ? 46 : 32} radius={size === 'big' ? 11 : 8} />
      <span className="cd-row-body">
        <span className="cd-row-name">{def?.name}</span>
        {showDesc && <span className="cd-row-desc">{def?.desc}</span>}
      </span>
      {action ?? (price != null && <span className="cd-price"><span className="ui-coin" /><span className="ui-num">{price}</span></span>)}
    </div>
  )
}

// Card tile (portrait tray under the board).
export function CardTile({ id, price, selected, disabled, onClick }) {
  const def = CARD_DEFS[id]
  return (
    <button
      type="button"
      className={`cd-tile${selected ? ' sel' : ''}${disabled ? ' off' : ''}`}
      onClick={onClick}
      aria-disabled={disabled || undefined}
      aria-pressed={!!selected}
      data-card={id}
    >
      <span className="cd-tile-art"><CardIcon id={id} size={56} radius={10} iconScale={0.56} /></span>
      <span className="cd-tile-name">{def?.name}</span>
      {price != null && <span className={`cd-tile-price${disabled ? ' no' : ''}`}>{price}</span>}
    </button>
  )
}

// Popover above the selected tray tile: name, description, cancel + main action.
export function TrayPopover({ id, actionLabel, actionDisabled, onAction, onClose }) {
  const def = CARD_DEFS[id]
  return (
    <div className="cd-pop" role="dialog" aria-label={def?.name} onClick={e => e.stopPropagation()}>
      <div className="cd-pop-head">
        <CardIcon id={id} size={44} radius={10} />
        <div className="cd-pop-text">
          <span className="cd-pop-name">{def?.name}</span>
          <span className="cd-pop-desc">{def?.desc}</span>
        </div>
      </div>
      <div className="cd-pop-actions">
        <button className="ui-btn icon" onClick={onClose} aria-label={t('common.cancel')}><IconClose /></button>
        {onAction && <button className="ui-btn primary cd-pop-main" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button>}
      </div>
    </div>
  )
}
