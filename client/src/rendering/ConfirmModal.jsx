import { useEffect } from 'react'
import Overlay from './ui/Overlay'
import { t } from '../i18n'

// Confirm dialog (surrender / draw offer / leave): icon circle, title,
// optional message, secondary + main buttons. A bottom sheet on phones.
// tone: 'danger' (red main button) | 'accent' (gold).
export default function ConfirmModal({ icon, tone = 'danger', title, message, confirmLabel = t('common.confirm'), cancelLabel = t('common.cancel'), onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <Overlay onClose={onCancel}>
      <div className="ui-modal ui-confirm" role="alertdialog" aria-label={title} onClick={e => e.stopPropagation()}>
        {icon && <div className={`ui-icon-circle ${tone === 'danger' ? 'danger' : tone === 'accent' ? 'accent' : ''}`}>{icon}</div>}
        <h2 className="ui-modal-title">{title}</h2>
        {message && <p className="ui-confirm-msg">{message}</p>}
        <div className="ui-modal-actions">
          <button className="ui-btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`ui-btn ${tone === 'danger' ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Overlay>
  )
}
