import { useState } from 'react'
import HowToPlay from './HowToPlay'
import './Lobby.css'

// Menu (create/join) + waiting-for-opponent screen. Once both seats are
// filled the server auto-starts the match (draft phase) — there's no
// character-select step here any more, armies are drafted per round.
export default function Lobby({ phase, room, busy, errorMsg, onCreate, onJoin, onLeave, nickname, onNicknameChange }) {
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied]     = useState(false)
  const [hostColor, setHostColor] = useState('white')
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)

  const howToPlayBtn = (
    <button className="lobby-howtoplay" onClick={() => setHowToPlayOpen(true)}>
      ❓ Как играть
    </button>
  )
  const howToPlayModal = howToPlayOpen && <HowToPlay onClose={() => setHowToPlayOpen(false)} />

  if (phase === 'menu') {
    return (
      <div className="lobby-screen">
        {howToPlayModal}
        <div className="lobby-title">Игра по сети</div>

        <div className="lobby-nickname">
          <label className="lobby-nickname-label" htmlFor="lobby-nickname-input">Ваш ник</label>
          <input
            id="lobby-nickname-input"
            className="lobby-nickname-input"
            value={nickname}
            maxLength={20}
            onChange={e => onNicknameChange(e.target.value)}
          />
        </div>

        <div className="lobby-menu-cards">
          <div className="lobby-menu-card lobby-create-card">
            <span className="lobby-menu-icon">➕</span>
            <span className="lobby-menu-label">Создать комнату</span>
            <span className="lobby-menu-desc">Получишь код — отправь его другу</span>

            <div className="lobby-color-toggle">
              <button
                type="button"
                className={`lobby-color-btn${hostColor === 'white' ? ' selected' : ''}`}
                onClick={() => setHostColor('white')}
              >
                <span className="lobby-color-dot p-white" /> Белые
              </button>
              <button
                type="button"
                className={`lobby-color-btn${hostColor === 'black' ? ' selected' : ''}`}
                onClick={() => setHostColor('black')}
              >
                <span className="lobby-color-dot p-black" /> Чёрные
              </button>
            </div>

            <button className="lobby-join-btn" disabled={busy} onClick={() => onCreate(hostColor)}>
              Создать
            </button>
          </div>

          <div className="lobby-menu-card lobby-join-card">
            <span className="lobby-menu-icon">🔑</span>
            <span className="lobby-menu-label">Присоединиться</span>
            <input
              className="lobby-code-input"
              placeholder="КОД КОМНАТЫ"
              value={joinCode}
              maxLength={6}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim()) onJoin(joinCode.trim()) }}
            />
            <button
              className="lobby-join-btn"
              disabled={busy || !joinCode.trim()}
              onClick={() => onJoin(joinCode.trim())}
            >
              Войти
            </button>
          </div>
        </div>

        {errorMsg && <div className="lobby-error">{errorMsg}</div>}

        {howToPlayBtn}
      </div>
    )
  }

  // phase === 'waiting' — room joined, waiting for the second seat to fill
  const players = room?.players ?? {}
  const statusFor = (color) => {
    const p = players[color]
    if (!p) return 'Не подключён'
    const status = p.connected ? 'в сети' : 'не в сети'
    return p.name ? `${p.name} · ${status}` : (p.connected ? 'Подключён' : 'Не подключён')
  }

  async function copyCode() {
    const text = room.code
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
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="lobby-screen">
      {howToPlayModal}
      <div className="lobby-title">Ожидание соперника</div>

      <button className="lobby-code-box" onClick={copyCode} title="Скопировать">
        <span className="lobby-code-label">Код комнаты</span>
        <span className="lobby-code-value">{room?.code}</span>
        <span className="lobby-code-hint">{copied ? 'Скопировано!' : 'нажми, чтобы скопировать'}</span>
      </button>

      <div className="lobby-players">
        <div className="lobby-player-row">
          <span className="lobby-player-dot p-white" />
          <span>Белые: {statusFor('white')}</span>
        </div>
        <div className="lobby-player-row">
          <span className="lobby-player-dot p-black" />
          <span>Чёрные: {statusFor('black')}</span>
        </div>
      </div>

      <div className="lobby-spinner" />

      {errorMsg && <div className="lobby-error">{errorMsg}</div>}

      <button className="lobby-back" onClick={onLeave}>← Выйти из комнаты</button>
      {howToPlayBtn}
    </div>
  )
}
