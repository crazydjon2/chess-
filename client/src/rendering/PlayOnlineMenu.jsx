import { t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { SettingsButton } from './Settings'
import { Piece } from '../skins/Piece'
import { IconBack, IconChevron, IconClose, IconKey, IconPlus, IconRefresh } from './ui/Icons'
import Overlay from './ui/Overlay'
import './PlayOnlineMenu.css'

const CODE_LEN = 5

function ColorAvatar({ color, size = 'md' }) {
  if (color === 'random') return <span className={`ui-avatar ${size} random`}><span className="ui-avatar-q">?</span></span>
  return <span className={`ui-avatar ${size} ${color}`}><Piece type="king" color={color} size={size === 'sm' ? 18 : 26} center thin /></span>
}

function ColorSeg({ value, onChange }) {
  return (
    <div className="ui-seg" role="radiogroup" aria-label={t('lobby.yourColor')}>
      {['white', 'black', 'random'].map(c => (
        <button key={c} type="button" role="radio" aria-checked={value === c} className={value === c ? 'on' : ''} onClick={() => onChange(c)}>
          <ColorAvatar color={c} size="sm" />
          {t(c === 'white' ? 'common.white' : c === 'black' ? 'common.black' : 'common.random')}
        </button>
      ))}
    </div>
  )
}

function Modal({ title, onClose, children, headExtra }) {
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

export default function PlayOnlineMenu({
  busy, errorMsg, onCreate, onJoin, onPlayBot, onExit, nickname, onNicknameChange,
  rooms = [], roomsLoading, openBot = false, onRefresh,
}) {
  const [joinCode, setJoinCode] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [hostColor, setHostColor] = useState('random')
  const [visibility, setVisibility] = useState('public')
  const [botOpen, setBotOpen] = useState(openBot)
  const [botLevel, setBotLevel] = useState('normal')
  const [botColor, setBotColor] = useState('random')
  const [nickOpen, setNickOpen] = useState(false)
  const [nickDraft, setNickDraft] = useState(nickname)
  const codeRef = useRef(null)

  function setCode(v) {
    const code = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN)
    setJoinCode(code)
    if (code.length === CODE_LEN && !busy) onJoin(code)
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      const m = text.toUpperCase().match(/ROOM\/([A-Z0-9]+)/) ?? text.toUpperCase().match(/[A-Z0-9]{5}/)
      if (m) setCode(m[1] ?? m[0])
    } catch {
      codeRef.current?.focus()
    }
  }

  const levels = [
    { id: 'weak', name: t('bot.weak'), hint: t('bot.weakHint') },
    { id: 'normal', name: t('bot.normal'), hint: t('bot.normalHint') },
    { id: 'strong', name: t('bot.strong'), hint: t('bot.strongHint') },
  ]
  const initial = (nickname || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="po-screen">
      <header className="po-header">
        <button className="ui-btn icon" onClick={onExit} aria-label={t('lobby.back')} data-testid="online-back"><IconBack /></button>
        <h1 className="po-title">{t('lobby.title')}</h1>
        <div className="po-header-right">
          <button className="po-me" onClick={() => { setNickDraft(nickname); setNickOpen(true) }} aria-label={t('lobby.nickname')} data-testid="nick-btn">
            <span className="po-me-ini">{initial}</span>
            <span className="po-me-name">{nickname || t('lobby.player')}</span>
          </button>
          <SettingsButton />
        </div>
      </header>

      <div className="po-main">
        <label className={`po-code${joinCode ? ' typing' : ''}`}>
          <span className="po-code-ic"><IconKey /></span>
          <input
            ref={codeRef}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            placeholder={t('lobby.codePlaceholder')}
            value={joinCode}
            maxLength={CODE_LEN}
            aria-label={t('lobby.codePlaceholder')}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim()) onJoin(joinCode.trim()) }}
            data-testid="code-input"
          />
          {joinCode
            ? <span className="po-code-dots" aria-hidden="true">{Array.from({ length: CODE_LEN }, (_, i) => <i key={i} className={i < joinCode.length ? 'on' : ''} />)}</span>
            : <button type="button" className="po-paste" onClick={paste}>{t('lobby.paste')}</button>}
        </label>

        <div className="po-list-head">
          <span className="po-list-title">{t('lobby.openLobbies')}</span>
          <span className="po-list-count">{rooms.length}</span>
          <button className="ui-btn icon po-refresh" onClick={onRefresh} aria-label={t('lobby.refresh')} title={t('lobby.refresh')}><IconRefresh /></button>
        </div>

        <div className="po-list ui-scroll">
          {rooms.length === 0 && (
            <div className="po-empty">{t(roomsLoading ? 'lobby.searching' : 'lobby.none')}</div>
          )}
          <div className="po-grid">
            {rooms.map(r => (
              <button className="po-row" key={r.code} disabled={busy} onClick={() => onJoin(r.code)} data-room={r.code}>
                <ColorAvatar color={r.hostColor ?? 'random'} />
                <span className="po-row-name">{r.hostName || t('lobby.player')}</span>
                <IconChevron />
              </button>
            ))}
          </div>
        </div>

        <button className="ui-btn primary po-create" disabled={busy} onClick={() => setCreateOpen(true)} data-testid="create-lobby">
          <IconPlus /> {t('lobby.create')}
        </button>
      </div>

      {errorMsg && <div className="ui-toast" role="status" key={errorMsg}>{errorMsg}</div>}

      {createOpen && (
        <Modal
          title={t('lobby.newLobby')}
          onClose={() => setCreateOpen(false)}
          headExtra={<span className="po-modal-kings"><Piece type="king" color="white" size={26} center thin /><Piece type="king" color="black" size={26} center thin /></span>}
        >
          <div className="ui-label po-field-label">{t('lobby.yourColor')}</div>
          <ColorSeg value={hostColor} onChange={setHostColor} />
          <div className="ui-label po-field-label">{t('lobby.access')}</div>
          <div className="ui-seg" role="radiogroup" aria-label={t('lobby.access')}>
            {['public', 'private'].map(v => (
              <button key={v} type="button" role="radio" aria-checked={visibility === v} className={visibility === v ? 'on' : ''} onClick={() => setVisibility(v)}>
                {t(v === 'public' ? 'lobby.public' : 'lobby.private')}
              </button>
            ))}
          </div>
          <button className="ui-btn primary big po-modal-submit" disabled={busy} onClick={() => { onCreate(hostColor, visibility); setCreateOpen(false) }} data-testid="create-submit">
            <IconPlus /> {t('lobby.createBtn')}
          </button>
        </Modal>
      )}

      {botOpen && (
        <Modal title={t('lobby.botTitle')} onClose={() => setBotOpen(false)}>
          <div className="ui-label po-field-label">{t('lobby.level')}</div>
          <div className="ui-seg" role="radiogroup" aria-label={t('lobby.level')}>
            {levels.map(l => (
              <button key={l.id} type="button" role="radio" aria-checked={botLevel === l.id} className={botLevel === l.id ? 'on' : ''} onClick={() => setBotLevel(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
          <p className="po-hint">{levels.find(l => l.id === botLevel)?.hint}</p>
          <div className="ui-label po-field-label">{t('lobby.yourColor')}</div>
          <ColorSeg value={botColor} onChange={setBotColor} />
          <button className="ui-btn primary big po-modal-submit" disabled={busy} onClick={() => { onPlayBot?.(botLevel, botColor); setBotOpen(false) }} data-testid="bot-start">
            {t('lobby.start')}
          </button>
        </Modal>
      )}

      {nickOpen && (
        <Modal title={t('lobby.nickname')} onClose={() => setNickOpen(false)}>
          <input
            className="po-nick-input"
            type="text"
            value={nickDraft}
            maxLength={20}
            autoFocus
            onChange={e => setNickDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onNicknameChange(nickDraft.trim()); setNickOpen(false) } }}
            aria-label={t('lobby.nickname')}
            data-testid="nick-input"
          />
          <button className="ui-btn primary big po-modal-submit" onClick={() => { onNicknameChange(nickDraft.trim()); setNickOpen(false) }}>
            {t('common.done')}
          </button>
        </Modal>
      )}
    </div>
  )
}
