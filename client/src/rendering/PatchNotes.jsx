import { t } from '../i18n'
import { PATCH_NOTES } from '../game/patchNotes'
import { patchNoteText } from '../i18n/patchNotes'
import './PatchNotes.css'

// Older entries fade out (background, opacity, text/icon color all mute
// together) so the list visually reads "recent -> history" at a glance,
// not just via the version-number tag — see PatchNotes.css's tier rules.
// Only the two newest keep their own card's accent color on the icon;
// everything older than that shares one flat muted grey, the same way a
// real patch history stops mattering which color a fix "was" once it's old.
function tierFor(index) {
  if (index < 2) return 'fresh'
  if (index === 2) return 'recent'
  if (index === 3) return 'aging'
  return 'old'
}

export default function PatchNotes({ onClose }) {
  return (
    <div className="pn-overlay" onClick={onClose}>
      <div className="pn-card" onClick={e => e.stopPropagation()}>
        <div className="pn-header">
          <span className="pn-title">{t('menu.whatsNew')}</span>
          <button className="pn-close" onClick={onClose} title={t('common.close')}>✕</button>
        </div>

        <div className="pn-list">
          {PATCH_NOTES.map((entry, i) => {
            const text = patchNoteText(entry.id)
            return (
              <div className={`pn-entry pn-entry-${tierFor(i)}`} key={entry.id} style={{ '--accent': entry.accent }}>
                {i === 0 && <span className="pn-entry-new">{t('patch.new')}</span>}
                <span className="pn-entry-glyph">{entry.glyph}</span>
                <div className="pn-entry-body">
                  <div className="pn-entry-head">
                    <span className="pn-entry-title">{text.title}</span>
                    <span className="pn-entry-version">{entry.version}</span>
                  </div>
                  <ul className="pn-changes">
                    {text.changes.map(change => <li key={change}>{change}</li>)}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
