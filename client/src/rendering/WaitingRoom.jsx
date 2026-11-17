import { t, playerName } from '../i18n'
import { useEffect, useState } from 'react'
import { SettingsButton } from './Settings'
import { Piece } from '../skins/Piece'
import { IconBack, IconLink, IconGlobe, IconLock, IconCheck } from './ui/Icons'
import { PORTAL, portalInviteLink } from '../portal'
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
  const myColor = room?.color
  const oppColor = myColor === 'white' ? 'black' : 'white'
  const me = players[myColor]
  const opp = players[oppColor]
  const bothHere = !!(me?.connected && opp?.connected)
  const isHost = room?.color === room?.host
  const elapsed = useElapsed(!bothHere)
  const code = room?.code ?? ''
  const isPrivate = room?.visibility === 'private'

  // portal: the invite must be the portal's own link, never our site —
  // fetched up front so the copy itself stays a direct click
  const [portalLink, setPortalLink] = useState(null)
  useEffect(() => {
    if (!PORTAL || !code) return
    let live = true
    portalInviteLink(code).then(l => { if (live) setPortalLink(l) })
    return () => { live = false }
  }, [code])

  async function copyLink() {
    const link = PORTAL ? (portalLink ?? await portalInviteLink(code)) : `${window.location.origin}/room/${code}`
    const ok = await copyText(link ?? code)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800) }
  }

  return (
    <div className="wr-screen">
      <header className="po-header">
        <button className="ui-btn icon" onClick={onLeave} aria-label={t('wait.cancel')} data-testid="wait-back"><IconBack /></button>
        <h1 className="po-title">{t('wait.title')}</h1>
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
          <span className="wr-vis">
            {isPrivate ? <IconLock size={16} /> : <IconGlobe size={16} />}
            {t(isPrivate ? 'wait.private' : 'wait.public')}
          </span>
          <div className="wr-code" aria-label={t('wait.code')} data-testid="room-code">
            {code.split('').map((ch, i) => <span key={i} className={`wr-tile${i % 2 ? ' d' : ''}`} style={{ '--i': i }}>{ch}</span>)}
          </div>
          <button className="ui-btn primary big wr-copy" onClick={copyLink}>
            {copied ? <IconCheck size={20} /> : <IconLink />}
            {t(copied ? 'wait.linkCopied' : 'wait.copyLink')}
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
          {bothHere && isHost && (
            <button className="ui-btn primary big" onClick={() => { if (!starting) { setStarting(true); onStart?.() } }} disabled={starting} data-testid="start-game">
              {t(starting ? 'wait.launching' : 'wait.startGame')}
            </button>
          )}
          {bothHere && !isHost && <span className="wr-note">{t('wait.hostSoon')}</span>}
        </div>
      </div>

      {errorMsg && <div className="ui-toast" role="status" key={errorMsg}>{errorMsg}</div>}
    </div>
  )
}
