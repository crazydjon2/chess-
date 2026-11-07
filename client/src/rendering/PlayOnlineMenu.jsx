import { t } from '../i18n'
import { useState } from 'react'
import './PlayOnlineMenu.css'

// "Игра по сети" — the lobby browser. Three ways in, all on one screen:
//   • the live list of open lobbies (public rooms waiting for a second
//     player — pushed from the server, see rooms.js's broadcastLobbyList)
//   • create your own (public = listed here for anyone, private = code/link
//     only)
//   • join by code, for a private room someone sent you
//   • play against the AI (see server/bot.js), at one of three levels
// An invite link (see WaitingRoom) drops straight into a room and never
// touches this screen at all.
//
// `onExit` returns all the way out to the main menu. Back calls it directly
// rather than fading out first — the main menu's own entrance animation
// starts immediately that way, with no dead pause.
const getBotLevels = () => [
  { id: 'weak', name: t('bot.weak'), hint: t('bot.weakHint') },
  { id: 'normal', name: t('bot.normal'), hint: t('bot.normalHint') },
  { id: 'strong', name: t('bot.strong'), hint: t('bot.strongHint') },
]
const getColors = () => [
  { id: 'white', name: t('common.white') },
  { id: 'black', name: t('common.black') },
  { id: 'random', name: t('common.random') },
]

export default function PlayOnlineMenu({
  busy, errorMsg, onCreate, onJoin, onPlayBot, onExit, nickname, onNicknameChange,
  rooms = [], roomsLoading,
}) {
  const [joinCode, setJoinCode] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [hostColor, setHostColor] = useState('white')
  const [visibility, setVisibility] = useState('public')
  const [botOpen, setBotOpen] = useState(false)
  const [botLevel, setBotLevel] = useState('normal')
  const [botColor, setBotColor] = useState('random')

  function submitCreate() {
    onCreate(hostColor, visibility)
    setCreateOpen(false)
  }

  function submitBot() {
    onPlayBot?.(botLevel, botColor)
    setBotOpen(false)
  }

  return (
    <div className="po-screen">
      <button className="po-back" onClick={onExit} title={t('lobby.back')}>←</button>

      <div className="po-title">{t('lobby.title')}</div>

      <div className="po-field">
        <label className="po-label" htmlFor="po-nickname">{t('lobby.nickname')}</label>
        <input
          id="po-nickname"
          className="po-input"
          type="text"
          value={nickname}
          maxLength={20}
          onChange={e => onNicknameChange(e.target.value)}
        />
      </div>

      {/* The list is the one flexible region — it scrolls inside itself so
         the screen stays a fixed-viewport dashboard on mobile (no page
         scroll), same pattern as the draft catalog. */}
      <div className="po-list-panel">
        <div className="po-list-head">
          <span className="po-list-title">{t('lobby.openLobbies')}</span>
          <span className="po-list-count">{rooms.length}</span>
        </div>

        <div className="po-list">
          {rooms.length === 0 && (
            <div className="po-list-empty">
              {t(roomsLoading ? 'lobby.searching' : 'lobby.none')}
            </div>
          )}
          {rooms.map(r => (
            <div className="po-room" key={r.code}>
              <span className={`po-room-dot p-${r.hostColor}`} />
              <div className="po-room-body">
                <span className="po-room-name">{r.hostName || t('lobby.player')}</span>
                <span className="po-room-sub">
                  {t(r.hostColor === 'white' ? 'lobby.playsWhite' : 'lobby.playsBlack', { code: r.code })}
                </span>
              </div>
              <button
                className="po-room-join"
                disabled={busy}
                onClick={() => onJoin(r.code)}
              >
                {t('lobby.join')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="po-actions">
        <button className="po-create-btn" disabled={busy} onClick={() => setCreateOpen(true)}>
          {t('lobby.create')}
        </button>
        <button className="po-create-btn po-bot-btn" disabled={busy} onClick={() => setBotOpen(true)}>
          {t('lobby.playBot')}
        </button>
        <div className="po-code-join">
          <input
            className="po-input po-code-input"
            type="text"
            placeholder={t('lobby.codePlaceholder')}
            value={joinCode}
            maxLength={6}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim()) onJoin(joinCode.trim()) }}
          />
          <button
            className="po-code-btn"
            disabled={busy || !joinCode.trim()}
            onClick={() => onJoin(joinCode.trim())}
          >
            {t('lobby.join')}
          </button>
        </div>
      </div>

      <div className="po-error-slot">
        {errorMsg && (
          <div className="po-error" key={errorMsg}>
            <span className="po-error-icon">!</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="po-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="po-modal" onClick={e => e.stopPropagation()}>
            <div className="po-modal-head">
              <span className="po-modal-title">{t('lobby.newLobby')}</span>
              <button className="po-modal-close" onClick={() => setCreateOpen(false)} title={t('common.close')}>✕</button>
            </div>

            <div className="po-modal-field">
              <span className="po-modal-label">{t('lobby.whoCanJoin')}</span>
              <div className="po-opt-row">
                <button
                  type="button"
                  className={`po-opt${visibility === 'public' ? ' selected' : ''}`}
                  onClick={() => setVisibility('public')}
                >
                  <span className="po-opt-name">{t('lobby.public')}</span>
                  <span className="po-opt-hint">{t('lobby.publicHint')}</span>
                  {visibility === 'public' && <span className="po-opt-check">✓</span>}
                </button>
                <button
                  type="button"
                  className={`po-opt${visibility === 'private' ? ' selected' : ''}`}
                  onClick={() => setVisibility('private')}
                >
                  <span className="po-opt-name">{t('lobby.private')}</span>
                  <span className="po-opt-hint">{t('lobby.privateHint')}</span>
                  {visibility === 'private' && <span className="po-opt-check">✓</span>}
                </button>
              </div>
            </div>

            <div className="po-modal-field">
              <span className="po-modal-label">{t('lobby.yourColor')}</span>
              <div className="po-opt-row">
                <button
                  type="button"
                  className={`po-color-opt${hostColor === 'white' ? ' selected' : ''} white`}
                  onClick={() => setHostColor('white')}
                >
                  <span className="po-color-dot white" /> {t('common.white')}
                  {hostColor === 'white' && <span className="po-color-check">✓</span>}
                </button>
                <button
                  type="button"
                  className={`po-color-opt${hostColor === 'black' ? ' selected' : ''} black`}
                  onClick={() => setHostColor('black')}
                >
                  <span className="po-color-dot black" /> {t('common.black')}
                  {hostColor === 'black' && <span className="po-color-check">✓</span>}
                </button>
                <button
                  type="button"
                  className={`po-color-opt${hostColor === 'random' ? ' selected' : ''} random`}
                  onClick={() => setHostColor('random')}
                >
                  <span className="po-color-dot random" /> {t('common.random')}
                  {hostColor === 'random' && <span className="po-color-check">✓</span>}
                </button>
              </div>
            </div>

            <button className="po-btn po-modal-submit" disabled={busy} onClick={submitCreate}>
              {t('lobby.createBtn')}
            </button>
          </div>
        </div>
      )}

      {botOpen && (
        <div className="po-modal-overlay" onClick={() => setBotOpen(false)}>
          <div className="po-modal" onClick={e => e.stopPropagation()}>
            <div className="po-modal-head">
              <span className="po-modal-title">{t('lobby.botTitle')}</span>
              <button className="po-modal-close" onClick={() => setBotOpen(false)} title={t('common.close')}>✕</button>
            </div>

            <div className="po-modal-field">
              <span className="po-modal-label">{t('lobby.level')}</span>
              <div className="po-opt-row">
                {getBotLevels().map(l => (
                  <button
                    key={l.id}
                    type="button"
                    className={`po-opt${botLevel === l.id ? ' selected' : ''}`}
                    onClick={() => setBotLevel(l.id)}
                  >
                    <span className="po-opt-name">{l.name}</span>
                    <span className="po-opt-hint">{l.hint}</span>
                    {botLevel === l.id && <span className="po-opt-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="po-modal-field">
              <span className="po-modal-label">{t('lobby.yourColor')}</span>
              <div className="po-opt-row">
                {getColors().map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`po-color-opt${botColor === c.id ? ' selected' : ''} ${c.id}`}
                    onClick={() => setBotColor(c.id)}
                  >
                    <span className={`po-color-dot ${c.id}`} /> {c.name}
                    {botColor === c.id && <span className="po-color-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <button className="po-btn po-modal-submit" disabled={busy} onClick={submitBot}>
              {t('lobby.start')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
