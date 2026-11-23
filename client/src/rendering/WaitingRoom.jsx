import { t, playerName } from '../i18n'
import { useEffect, useState } from 'react'
import { SettingsButton } from './Settings'
import { Piece } from '../skins/Piece'
import { IconBack, IconLink, IconGlobe, IconLock, IconCheck } from './ui/Icons'
import { track } from '../analytics'
import './WaitingRoom.css'

function useElapsed(running) {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  const s = Math.floor((now - start) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Seconds left of an n-second countdown that starts when `running` turns true.
function useCountdown(running, n) {
  const [left, setLeft] = useState(n)
  useEffect(() => {
    if (!running) { setLeft(n); return }
    const t0 = Date.now()
    const id = setInterval(() => setLeft(Math.max(0, n - Math.floor((Date.now() - t0) / 1000))), 200)
    return () => clearInterval(id)
  }, [running, n])
  return left
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true } catch { /* fall back */ }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

export default function WaitingRoom({ room, errorMsg, onLeave, onStart }) {
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const players = room?.players ?? {}
  const myColor = room?.color ?? 'white' // unknown for a split second while a search is being placed
  const oppColor = myColor === 'white' ? 'black' : 'white'
  const me = players[myColor]
  const opp = players[oppColor]
  const bothHere = !!(me?.connected && opp?.connected)
  const isHost = room?.color === room?.host
  const elapsed = useElapsed(!bothHere)
  const code = room?.code ?? ''
  const isPrivate = room?.visibility === 'private'
  // "Найти соперника" room: a stranger or an invited friend, whoever comes
  // first; the server starts the match by itself (rooms.js scheduleQuickStart).
  const quick = !!room?.quick
  const startsIn = useCountdown(quick && bothHere, 3)

  // Phones get the native share sheet (Telegram, WhatsApp…); desktops copy.
  async function shareLink() {
    if (!code) return
    track(quick ? 'share_quick' : 'share_friend')
    const url = `${window.location.origin}/room/${code}`
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    if (touch && navigator.share) {
      try { await navigator.share({ title: 'Mischess', text: t('wait.shareText'), url }); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    const ok = await copyText(url)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800) }
  }

  return (
    <div className="wr-screen">
      <header className="po-header">
        <button className="ui-btn icon" onClick={onLeave} aria-label={t('wait.cancel')} data-testid="wait-back"><IconBack /></button>
        <h1 className="po-title">{t(quick ? 'wait.searchTitle' : 'wait.title')}</h1>
        <div className="po-header-right">
          <span className="po-me static">
            <span className="po-me-ini">{(playerName(me) || '?').charAt(0).toUpperCase()}</span>
            <span className="po-me-name">{playerName(me) || t('lobby.player')}</span>
          </span>
          <SettingsButton />
        </div>
      </header>

      <div className="wr-main">
        <section className="ui-panel wr-panel">
          <span className="wr-vis" data-testid={quick ? 'quick-search' : undefined}>
            {quick || !isPrivate ? <IconGlobe size={16} /> : <IconLock size={16} />}
            {t(quick ? 'wait.randomOpp' : isPrivate ? 'wait.private' : 'wait.public')}
          </span>
          {!quick && (
            <div className="wr-code" aria-label={t('wait.code')} data-testid="room-code">
              {code.split('').map((ch, i) => <span key={i} className={`wr-tile${i % 2 ? ' d' : ''}`} style={{ '--i': i }}>{ch}</span>)}
            </div>
          )}
          <button className={`ui-btn ${quick ? '' : 'primary big '}wr-copy`} onClick={shareLink} disabled={!code} data-testid="share-link">
            {copied ? <IconCheck size={20} /> : <IconLink />}
            {t(copied ? 'wait.linkCopied' : quick ? 'wait.inviteFriend' : 'wait.sendLink')}
          </button>
        </section>

        <div className="wr-seats">
          <div className="wr-seat me">
            <span className={`ui-avatar ${myColor}`}><Piece type="king" color={myColor} size={32} center thin /></span>
            <span className="wr-seat-name">{playerName(me) || t('lobby.player')}</span>
          </div>
          <span className="wr-vs">VS</span>
          {opp?.connected ? (
            <div className="wr-seat filled">
              <span className={`ui-avatar ${oppColor}`}><Piece type="king" color={oppColor} size={32} center thin /></span>
              <span className="wr-seat-name">{playerName(opp) || t('wait.connected')}</span>
            </div>
          ) : (
            <div className="wr-seat free">
              <span className="wr-seat-ghost"><Piece type="king" color="white" size={30} center thin /></span>
              <span className="wr-seat-wait">{t('wait.waitingPlayer')}</span>
              <span className="wr-seat-time ui-num">{elapsed}</span>
            </div>
          )}
        </div>

        <div className="wr-action">
          {bothHere && quick && <span className="wr-note">{t('wait.startsIn', { n: startsIn })}</span>}
          {bothHere && !quick && isHost && (
            <button className="ui-btn primary big" onClick={() => { if (!starting) { setStarting(true); onStart?.() } }} disabled={starting} data-testid="start-game">
              {t(starting ? 'wait.launching' : 'wait.startGame')}
            </button>
          )}
          {bothHere && !quick && !isHost && <span className="wr-note">{t('wait.hostSoon')}</span>}
        </div>
      </div>

      {errorMsg && <div className="ui-toast" role="status" key={errorMsg}>{errorMsg}</div>}
    </div>
  )
}
