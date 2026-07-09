import { PATCH_NOTES } from '../game/patchNotes'
import './PatchNotes.css'

export default function PatchNotes({ onClose }) {
  return (
    <div className="pn-overlay" onClick={onClose}>
      <div className="pn-card" onClick={e => e.stopPropagation()}>
        <button className="pn-close" onClick={onClose} title="Закрыть">✕</button>
        <div className="pn-title">Что нового</div>

        <div className="pn-list">
          {PATCH_NOTES.map((entry, i) => (
            <div className="pn-entry" key={entry.title} style={{ '--accent': entry.accent }}>
              <div className="pn-entry-glyph">{entry.glyph}</div>
              <div className="pn-entry-body">
                <div className="pn-entry-head">
                  {i === 0 && <span className="pn-entry-latest">Новое</span>}
                  <span className="pn-entry-title">{entry.title}</span>
                  <span className="pn-entry-date">{entry.date}</span>
                </div>
                <ul className="pn-changes">
                  {entry.changes.map(change => <li key={change}>{change}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
