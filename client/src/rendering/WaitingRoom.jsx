import { t, playerName } from '../i18n'
import { useState } from 'react'
import { PIECE_ICONS } from './pieceIcons'
import './WaitingRoom.css'

const DEAL_PIECES = [
  { type: 'pawn',   color: 'white' },
  { type: 'knight', color: 'black' },
  { type: 'rook',   color: 'white' },
]

// "Лобби ожидания" — room created/joined, waiting for the second seat, then
// the host presses "Начать". Same felt-table card language as the other
// online-flow screens.
export default function WaitingRoom({ room, errorMsg, onLeave, onStart }) {
  const [copied, setCopied] = useState(null) // null | 'code' | 'link'
  const [starting, setStarting] = useState(false)

  const players = room?.players ?? {}
  const bothHere = !!(players.white?.connected && players.black?.connected)
  const isHost = room?.color === room?.host

  function handleStart() {
    if (starting) return
    setStarting(true)
    onStart?.() // 'click' comes from the global button listener (sound.js)
  }
  const rowFor = (color) => {
    const p = players[color]
    const isMe = color === room?.color
    return {
      color,
      isMe,
      connected: !!p?.connected,
      label: p?.connected ? (playerName(p) || t('wait.connected')) : t('wait.waitingPlayer'),
      sub: `${t(color === 'white' ? 'common.white' : 'common.black')} · ${t(isMe ? 'wait.thisIsYou' : p?.connected ? 'wait.online' : 'wait.offline')}`,
    }
  }

  // Shareable deep link — the room's own address (see App.jsx's routing);
  // opening it walks straight into the room.
  function inviteLink() {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/room/${room?.code ?? ''}`
  }

  async function copyText(text, kind) {
    let ok = false

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        ok = true
      } catch {
        ok = false
      }
    }

    // Fallback for insecure contexts (e.g. testing over a LAN IP without
    // https, where navigator.clipboard doesn't exist at all) or browsers
    // without the async clipboard API.
    if (!ok) {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      document.body.removeChild(textarea)
    }

    if (ok) {
      setCopied(kind)
      setTimeout(() => setCopied(null), 1800)
    }
  }

  return (
    <div className="wr-screen">
      <div className="wr-title">{t('wait.title')}</div>
      <div className="wr-subtitle">{t('wait.subtitle')}</div>

      <div className="wr-panel">
        <div className="wr-code-block">
          <div className="wr-code-labelrow">
            <span className="wr-code-label">{t('wait.code')}</span>
            <span className={`wr-vis-badge ${room?.visibility === 'private' ? 'private' : 'public'}`}>
              {t(room?.visibility === 'private' ? 'wait.private' : 'wait.public')}
            </span>
          </div>
          <button className="wr-code-box" onClick={() => copyText(room?.code ?? '', 'code')}>
            <span className="wr-code-value">{room?.code}</span>
            <span className="wr-copy-icon">
              <span />
            </span>
          </button>
          {/* An invite link is the one-tap way in — the recipient never has
             to find the join screen or type the code at all. */}
          <button className="wr-link-btn" onClick={() => copyText(inviteLink(), 'link')}>
            {t('wait.copyLink')}
          </button>
          <span className="wr-copy-status">
            {copied === 'code'
              ? <span className="wr-copied">{t('wait.codeCopied')}</span>
              : copied === 'link'
                ? <span className="wr-copied">{t('wait.linkCopied')}</span>
                : <span className="wr-copy-hint">{t('wait.copyHint')}</span>}
          </span>
        </div>

        <div className="wr-divider" />

        <div className="wr-players">
          {['white', 'black'].map(color => {
            const row = rowFor(color)
            return (
              <div key={color} className={`wr-player-row${row.connected ? ' connected' : ' waiting'}${row.isMe ? ' is-me' : ''}`}>
                <span className={`wr-player-dot p-${color}`} />
                <div className="wr-player-info">
                  <div className="wr-player-name">{row.label}{row.isMe && <span className="wr-you-badge">{t('wait.youBadge')}</span>}</div>
                  <div className="wr-player-sub">{row.sub}</div>
                </div>
                <span className="wr-status-dot" />
              </div>
            )
          })}
        </div>

        <div className="wr-divider" />

        {/* Fixed-height action slot — the loader, the start button and the
           "waiting for host" line all live here at the SAME height so the
           panel never resizes/jumps as the room fills or the host starts. */}
        <div className="wr-action">
          {!bothHere ? (
            <div className="wr-deal">
              <div className="wr-deal-pieces">
                {DEAL_PIECES.map((p, i) => (
                  <span key={i} className="wr-deal-piece" style={{ animationDelay: `${i * 0.15}s` }}>
                    {PIECE_ICONS[p.color][p.type]}
                  </span>
                ))}
              </div>
              <span className="wr-deal-text">{t('wait.searching')}</span>
            </div>
          ) : isHost ? (
            <button className="wr-start-btn" onClick={handleStart} disabled={starting}>
              {t(starting ? 'wait.launching' : 'wait.startGame')}
            </button>
          ) : (
            <div className="wr-deal">
              <div className="wr-deal-pieces">
                {DEAL_PIECES.map((p, i) => (
                  <span key={i} className="wr-deal-piece" style={{ animationDelay: `${i * 0.15}s` }}>
                    {PIECE_ICONS[p.color][p.type]}
                  </span>
                ))}
              </div>
              <span className="wr-deal-text">{t('wait.hostSoon')}</span>
            </div>
          )}
        </div>

        <button className="wr-cancel-btn" onClick={onLeave}>{t('wait.cancel')}</button>
      </div>

      <div className="wr-error-slot">
        {errorMsg && (
          <div className="wr-error" key={errorMsg}>
            <span className="wr-error-icon">!</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  )
}
