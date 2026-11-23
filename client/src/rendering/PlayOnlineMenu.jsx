import { t } from '../i18n'
import { useRef, useState } from 'react'
import { SettingsButton } from './Settings'
import { Piece } from '../skins/Piece'
import { IconBack, IconChevron, IconKey, IconPlus, IconRefresh } from './ui/Icons'
import Modal from './ui/Modal'
import NamePlate from './NamePlate'
import { DiscordNudge } from './ui/Discord'
import './PlayOnlineMenu.css'

const CODE_LEN = 5
// The open-rooms browser is hidden while the player base is tiny: it's
// nearly always empty, and "Найти соперника" (main menu) already seats you
// with whoever is waiting. Flip back on once there are enough players to
// browse — public/private choice in the create dialog comes back with it.
const SHOW_ROOM_LIST = false

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
  const codeRef = useRef(null)

  function setCode(v) {
    const code = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN)
    setJoinCode(code)
    if (code.length === CODE_LEN && !busy) onJoin(code)
  }

  // A plain paste (Ctrl+V / long-press → Paste) needs no clipboard
  // permission, unlike navigator.clipboard.readText() behind a button, which
  // made the browser ask every time. Accepts a bare code or a whole invite
  // link (…/room/ABCDE) — maxLength would otherwise cut a link to "HTTPS".
  function onPaste(e) {
    const text = (e.clipboardData?.getData('text') ?? '').toUpperCase()
    const m = text.match(/ROOM\/([A-Z0-9]+)/) ?? text.match(/\b[A-Z0-9]{5}\b/)
    e.preventDefault()
    if (m) setCode(m[1] ?? m[0])
  }

  const levels = [
    { id: 'weak', name: t('bot.weak'), hint: t('bot.weakHint') },
    { id: 'normal', name: t('bot.normal'), hint: t('bot.normalHint') },
    { id: 'strong', name: t('bot.strong'), hint: t('bot.strongHint') },
  ]

  return (
    <div className="po-screen">
      <header className="po-header">
        <button className="ui-btn icon" onClick={onExit} aria-label={t('lobby.back')} data-testid="online-back"><IconBack /></button>
        <h1 className="po-title">{t('lobby.title')}</h1>
        <div className="po-header-right">
          <NamePlate />
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
            onPaste={onPaste}
            onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim()) onJoin(joinCode.trim()) }}
            data-testid="code-input"
          />
          {joinCode && <span className="po-code-dots" aria-hidden="true">{Array.from({ length: CODE_LEN }, (_, i) => <i key={i} className={i < joinCode.length ? 'on' : ''} />)}</span>}
        </label>

        {!SHOW_ROOM_LIST && <p className="po-friend-hint">{t('lobby.friendHint')}</p>}

        {SHOW_ROOM_LIST && <>
        <div className="po-list-head">
          <span className="po-list-title">{t('lobby.openLobbies')}</span>
          <span className="po-list-count">{rooms.length}</span>
          <button className="ui-btn icon po-refresh" onClick={onRefresh} aria-label={t('lobby.refresh')} title={t('lobby.refresh')}><IconRefresh /></button>
        </div>

        <div className="po-list ui-scroll">
          {rooms.length === 0 && (
            <div className="po-empty">
              {t(roomsLoading ? 'lobby.searching' : 'lobby.none')}
              {!roomsLoading && <div className="po-empty-dc"><DiscordNudge /></div>}
            </div>
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
        </>}

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
          {SHOW_ROOM_LIST && <>
          <div className="ui-label po-field-label">{t('lobby.access')}</div>
          <div className="ui-seg" role="radiogroup" aria-label={t('lobby.access')}>
            {['public', 'private'].map(v => (
              <button key={v} type="button" role="radio" aria-checked={visibility === v} className={visibility === v ? 'on' : ''} onClick={() => setVisibility(v)}>
                {t(v === 'public' ? 'lobby.public' : 'lobby.private')}
              </button>
            ))}
          </div>
          </>}
          <button className="ui-btn primary big po-modal-submit" disabled={busy} onClick={() => { onCreate(hostColor, SHOW_ROOM_LIST ? visibility : 'private'); setCreateOpen(false) }} data-testid="create-submit">
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

    </div>
  )
}
