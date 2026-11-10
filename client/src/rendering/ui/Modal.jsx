import { useEffect } from 'react'
import { t } from '../../i18n'
import Overlay from './Overlay'
import { IconClose } from './Icons'
import '../PlayOnlineMenu.css'

// Small titled modal (lobby dialogs, rename). Escape / backdrop close it.
export default function Modal({ title, onClose, children, headExtra }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Overlay onClose={onClose}>
      <div className="ui-modal po-modal" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <button className="ui-btn icon po-modal-x" onClick={onClose} aria-label={t('common.close')}><IconClose /></button>
        <div className="po-modal-head">
          <h2 className="ui-modal-title po-modal-title">{title}</h2>
          {headExtra}
        </div>
        {children}
      </div>
    </Overlay>
  )
}
