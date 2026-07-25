import { useState } from 'react'
import './PlayOnlineMenu.css'

// "Играть онлайн" — create/join a room. Same felt-table card language as
// MainMenu.jsx/PatchNotes.jsx. `onExit` returns all the way out to the
// main menu (App.jsx's mode-select screen).
//
// Back just calls onExit directly — it used to fade the screen out over a
// timeout first (to fake an exit animation, since App.jsx's
// noExitSnapshotFor stops OnlineApp from being snapshot-animated), but that
// self-fade read as a dead pause: nothing obvious happened for ~260ms and
// only THEN did the main menu appear. Going straight to onExit lets the
// main menu's own entrance animation start immediately — snappy, no pause.
export default function PlayOnlineMenu({ busy, errorMsg, onCreate, onJoin, onExit, nickname, onNicknameChange }) {
  const [joinCode, setJoinCode] = useState('')
  const [hostColor, setHostColor] = useState('white')

  return (
    <div className="po-screen">
      <button className="po-back" onClick={onExit} title="Назад в меню">←</button>

      <div className="po-title">Игра по сети</div>

      <div className="po-field">
        <label className="po-label" htmlFor="po-nickname">Ваш ник</label>
        <input
          id="po-nickname"
          className="po-input"
          type="text"
          value={nickname}
          maxLength={20}
          onChange={e => onNicknameChange(e.target.value)}
        />
      </div>

      <div className="po-cards">
        <div className="po-card po-card-create">
          <span className="po-card-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="#241708" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
          </span>
          <div className="po-card-head">
            <span className="po-card-title">Создать комнату</span>
          </div>

          <div className="po-color-field">
            <span className="po-sublabel">Твой цвет</span>
            <div className="po-color-row">
              <button
                type="button"
                className={`po-color-opt${hostColor === 'white' ? ' selected' : ''} white`}
                onClick={() => setHostColor('white')}
              >
                <span className="po-color-dot white" /> Белые
                {hostColor === 'white' && <span className="po-color-check">✓</span>}
              </button>
              <button
                type="button"
                className={`po-color-opt${hostColor === 'black' ? ' selected' : ''} black`}
                onClick={() => setHostColor('black')}
              >
                <span className="po-color-dot black" /> Чёрные
                {hostColor === 'black' && <span className="po-color-check">✓</span>}
              </button>
            </div>
          </div>

          <button className="po-btn" disabled={busy} onClick={() => onCreate(hostColor)}>Создать</button>
        </div>

        <div className="po-card po-card-join">
          <span className="po-card-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M4 8C4 5.79 5.79 4 8 4H10" stroke="#241708" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M4 16C4 18.21 5.79 20 8 20H10" stroke="#241708" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M13 8L18 12L13 16" stroke="#241708" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 12H18" stroke="#241708" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <div className="po-card-head">
            <span className="po-card-title">Присоединиться</span>
          </div>

          <div className="po-color-field">
            <span className="po-sublabel">Код комнаты</span>
            <input
              className="po-input po-code-input"
              type="text"
              placeholder="Например, KX92F"
              value={joinCode}
              maxLength={6}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim()) onJoin(joinCode.trim()) }}
            />
          </div>

          <button className="po-btn" disabled={busy || !joinCode.trim()} onClick={() => onJoin(joinCode.trim())}>Войти</button>
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
    </div>
  )
}
