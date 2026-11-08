import { t } from '../i18n'
import { useEffect } from 'react'
import { PATCH_NOTES } from '../game/patchNotes'
import { patchNoteText } from '../i18n/patchNotes'
import { IconClose } from './ui/Icons'
import Overlay from './ui/Overlay'
import './PatchNotes.css'

// "Что нового": newest first; older entries are muted (see .old).
export default function PatchNotes({ onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Overlay onClose={onClose}>
      <div className="ui-modal pn-modal" role="dialog" aria-label={t('menu.whatsNew')} onClick={e => e.stopPropagation()}>
        <div className="pn-head">
          <h2 className="ui-modal-title">{t('menu.whatsNew')}</h2>
          <button className="ui-btn icon" onClick={onClose} aria-label={t('common.close')}><IconClose /></button>
        </div>
        <div className="pn-list ui-scroll">
          {PATCH_NOTES.map((entry, i) => {
            const text = patchNoteText(entry.id)
            return (
              <article className={`pn-entry${i > 1 ? ' old' : ''}`} key={entry.id}>
                <span className="pn-glyph" style={{ background: i > 1 ? undefined : entry.accent }}>{entry.glyph}</span>
                <div className="pn-body">
                  <div className="pn-entry-head">
                    <span className="pn-title">{text.title}</span>
                    {i === 0 && <span className="pn-new">{t('patch.new')}</span>}
                    <span className="pn-ver">{entry.version}</span>
                  </div>
                  <ul className="pn-changes">
                    {text.changes.map(change => <li key={change}>{change}</li>)}
                  </ul>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </Overlay>
  )
}
