import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isMuted, setMuted, getVolume, setVolume, previewVolume, isMusicOn, setMusicOn, getMusicVolume, setMusicVolume } from '../sound'
import { LANGUAGES, useLang, setLang, t } from '../i18n'
import { IconClose, IconDown, IconCheck, IconSettings } from './ui/Icons'
import { isAmbientOn, setAmbientOn } from './ui/ambientPref'
import Overlay from './ui/Overlay'
import { Flag } from './ui/Flags'
import './Settings.css'

// Language name in the CURRENT UI language ("английский"), shown next to
// each native name in the picker.
function localizedName(code, uiLang) {
  try { return new Intl.DisplayNames([uiLang], { type: 'language' }).of(code) ?? '' } catch { return '' }
}

function LangPicker() {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  // Where the list fits: { up, max } — measured on open so it never runs off-screen.
  const [place, setPlace] = useState({ up: false, max: 300 })
  const ref = useRef(null)
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const vh = window.visualViewport?.height ?? window.innerHeight
    const below = vh - r.bottom - 16
    const above = r.top - 16
    const up = below < 300 && above > below
    setPlace({ up, max: Math.max(120, Math.min(300, up ? above : below)) })
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])
  const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]
  // Current language first, then the rest in the registry order.
  const list = [current, ...LANGUAGES.filter(l => l.code !== current.code)]
  return (
    <div className="set-lang" ref={ref}>
      <button type="button" className={`set-lang-btn${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={t('settings.language')}>
        <Flag code={current.code} className="set-lang-flag" />
        <span className="set-lang-name">{current.label}</span>
        <IconDown up={open} />
      </button>
      {open && (
        <div className={`set-lang-list ui-scroll${place.up ? ' up' : ''}`} role="listbox" style={{ maxHeight: place.max }}>
          {list.map(l => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === lang}
              className={`set-lang-opt${l.code === lang ? ' on' : ''}`}
              onClick={() => { setLang(l.code); setOpen(false) }}
            >
              <Flag code={l.code} className="set-lang-flag" />
              <span className="set-lang-name" lang={l.code}>{l.label}</span>
              {l.code === lang ? <IconCheck size={18} /> : <span className="set-lang-local">{localizedName(l.code, lang)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" className={`set-toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className="set-toggle-knob" />
    </button>
  )
}

function Slider({ value, disabled, onChange, onCommit, label }) {
  return (
    <input
      className="set-slider"
      type="range"
      min="0"
      max="100"
      value={value}
      disabled={disabled}
      aria-label={label}
      style={{ '--v': `${value}%` }}
      onChange={e => onChange(Number(e.target.value))}
      onPointerUp={onCommit}
    />
  )
}

export default function Settings({ onClose }) {
  const [muted, setMutedState] = useState(isMuted)
  const [volume, setVolumeState] = useState(() => Math.round(getVolume() * 100))
  const [music, setMusicState] = useState(isMusicOn)
  const [musicVol, setMusicVolState] = useState(() => Math.round(getMusicVolume() * 100))
  const [ambient, setAmbientState] = useState(isAmbientOn)
  useLang()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Overlay onClose={onClose}>
      <div className="ui-modal set-card" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('settings.title')}>
        <h2 className="ui-modal-title">{t('settings.title')}</h2>
        <button className="ui-btn icon ui-modal-close" onClick={onClose} aria-label={t('common.close')}><IconClose /></button>

        <div className="ui-caps set-section">{t('settings.sound')}</div>
        <div className="set-row">
          <span className="set-row-label">{t('settings.gameSounds')}</span>
          <Slider value={volume} disabled={muted} label={t('settings.volume')}
            onChange={v => { setVolumeState(v); setVolume(v / 100) }}
            onCommit={() => !muted && previewVolume()} />
          <span className="set-value ui-num">{muted ? '—' : volume}</span>
          <Toggle on={!muted} label={t('settings.gameSounds')} onChange={on => { setMutedState(!on); setMuted(!on); if (on) previewVolume() }} />
        </div>
        <div className="set-row">
          <span className="set-row-label">{t('settings.music')}</span>
          <Slider value={musicVol} disabled={!music} label={t('settings.music')}
            onChange={v => { setMusicVolState(v); setMusicVolume(v / 100) }} />
          <span className="set-value ui-num">{music ? musicVol : '—'}</span>
          <Toggle on={music} label={t('settings.music')} onChange={on => { setMusicState(on); setMusicOn(on) }} />
        </div>

        <div className="set-divider" />
        <div className="ui-caps set-section">{t('settings.graphics')}</div>
        <div className="set-row set-row-toggle">
          <span className="set-row-label">{t('settings.liveBackground')}</span>
          <Toggle on={ambient} label={t('settings.liveBackground')} onChange={on => { setAmbientState(on); setAmbientOn(on) }} />
        </div>

        <div className="set-divider" />
        <div className="ui-caps set-section">{t('settings.language')}</div>
        <LangPicker />
      </div>
    </Overlay>
  )
}

// The sliders button every screen header carries; owns its own modal.
export function SettingsButton({ className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={`ui-btn icon ${className}`} onClick={() => setOpen(true)} aria-label={t('settings.title')} title={t('settings.title')} data-testid="settings-btn">
        <IconSettings />
      </button>
      {open && <Settings onClose={() => setOpen(false)} />}
    </>
  )
}
