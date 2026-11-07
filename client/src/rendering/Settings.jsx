import { useEffect, useState } from 'react'
import { isMuted, setMuted, getVolume, setVolume, previewVolume } from '../sound'
import { LANGUAGES, useLang, setLang, t } from '../i18n'
import './Settings.css'

// App settings modal — opened by the global gear (see MenuLayout.jsx), so
// it's reachable from every screen. Two sections:
//   • Звук  — on/off + volume, both persisted (see sound.js)
//   • Язык  — UI language (see i18n/), persisted, autodetected on first visit
export default function Settings({ onClose }) {
  const [muted, setMutedState] = useState(isMuted)
  const [volume, setVolumeState] = useState(getVolume)
  const lang = useLang()

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
          <span className="set-title">{t('settings.title')}</span>
          <button className="set-close" onClick={onClose} title={t('common.close')}>✕</button>
        </div>

        <div className="set-section">
          <div className="set-section-title">{t('settings.sound')}</div>

          <label className="set-row set-toggle-row">
            <span className="set-row-label">{t('settings.gameSounds')}</span>
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
            <span className="set-row-label">{t('settings.volume')}</span>
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
          <div className="set-section-title">{t('settings.language')}</div>
          <label className="set-lang-select-wrap">
            <select
              className="set-lang-select"
              value={lang}
              onChange={e => setLang(e.target.value)}
              aria-label={t('settings.language')}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
