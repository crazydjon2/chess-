import { useEffect, useState } from 'react'
import { isMuted, setMuted, getVolume, setVolume, previewVolume } from '../sound'
import './Settings.css'

// App settings modal — opened by the global gear (see MenuLayout.jsx), so
// it's reachable from every screen. Two sections:
//   • Звук  — on/off + volume, both persisted (see sound.js)
//   • Язык  — a stub for now (only Russian; English is a disabled "soon")
const LANGUAGES = [
  { code: 'ru', label: 'Русский', enabled: true },
  { code: 'en', label: 'English', enabled: false },
]

export default function Settings({ onClose }) {
  const [muted, setMutedState] = useState(isMuted)
  const [volume, setVolumeState] = useState(getVolume)
  const [lang, setLang] = useState('ru')

  // Esc closes, like the other modals.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleMute() {
    const next = !muted
    setMutedState(next)
    setMuted(next)
    if (!next) previewVolume() // hear it come back on
  }

  function onVolumeInput(e) {
    const v = Number(e.target.value) / 100
    setVolumeState(v)
    setVolume(v)
  }

  return (
    <div className="set-overlay" onClick={onClose}>
      <div className="set-card" onClick={e => e.stopPropagation()}>
        <div className="set-header">
          <span className="set-title">Настройки</span>
          <button className="set-close" onClick={onClose} title="Закрыть">✕</button>
        </div>

        <div className="set-section">
          <div className="set-section-title">Звук</div>

          <label className="set-row set-toggle-row">
            <span className="set-row-label">Звуки игры</span>
            <button
              type="button"
              className={`set-toggle${muted ? '' : ' on'}`}
              role="switch"
              aria-checked={!muted}
              onClick={toggleMute}
            >
              <span className="set-toggle-knob" />
            </button>
          </label>

          <div className={`set-row set-volume-row${muted ? ' disabled' : ''}`}>
            <span className="set-row-label">Громкость</span>
            <input
              className="set-slider"
              type="range"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              disabled={muted}
              onChange={onVolumeInput}
              onMouseUp={() => !muted && previewVolume()}
              onTouchEnd={() => !muted && previewVolume()}
            />
            <span className="set-volume-value">{Math.round(volume * 100)}</span>
          </div>
        </div>

        <div className="set-section">
          <div className="set-section-title">Язык</div>
          <div className="set-lang-row">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                className={`set-lang${lang === l.code ? ' selected' : ''}`}
                disabled={!l.enabled}
                onClick={() => l.enabled && setLang(l.code)}
              >
                {l.label}
                {!l.enabled && <span className="set-lang-soon">скоро</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
