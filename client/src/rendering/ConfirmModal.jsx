import './ConfirmModal.css'

// Generic yes/no confirmation overlay — used for anything destructive
// enough to need a second click (currently: surrender).
export default function ConfirmModal({ title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-card" onClick={e => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        {message && <div className="confirm-message">{message}</div>}
        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>{cancelLabel}</button>
          <button className="confirm-btn danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
