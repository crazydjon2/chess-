// Portal mode. Portals embed the normal site in an iframe with a flag:
//   https://mischess.com/?portal=crazygames
// Same build, a few portal rules applied: routes live in the hash (the
// portal's iframe URL must stay as given), invites go through the portal's
// own share link (never a link to our site), gameplay start/stop is
// reported to the portal. On the normal site PORTAL is null: all no-ops.
const KNOWN = ['crazygames']
function detectPortal() {
  try {
    const p = new URLSearchParams(window.location.search).get('portal')
    return KNOWN.includes(p) ? p : null
  } catch { return null }
}
export const PORTAL = typeof window === 'undefined' ? null : detectPortal()

// CrazyGames HTML5 SDK v3 (https://docs.crazygames.com). Loaded only in
// CrazyGames mode; until it's ready (or if it fails / runs outside
// CrazyGames) every call below silently does nothing.
let sdk = null
let ready = null

export function initPortal() {
  if (PORTAL !== 'crazygames' || ready) return ready
  ready = new Promise(resolve => {
    const s = document.createElement('script')
    s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
    s.onload = async () => {
      try {
        await window.CrazyGames.SDK.init()
        sdk = window.CrazyGames.SDK
      } catch { /* outside CrazyGames: stays null */ }
      resolve(sdk)
    }
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
  return ready
}

// Room code from a CrazyGames invite link (…?room=KX92F on their page).
export async function portalInviteRoom() {
  await ready
  try { return sdk?.game?.getInviteParam?.('room') || null } catch { return null }
}

// CrazyGames "play with friends": the party leader should land straight in
// a fresh private room.
export async function portalInstantMultiplayer() {
  await ready
  try { return !!sdk?.game?.isInstantMultiplayer } catch { return false }
}

// The portal's own invite button (in its UI, next to the game) while we sit
// in a room waiting for the opponent; null hides it.
export function portalInviteButton(code) {
  ready?.then(() => {
    try {
      if (code) sdk?.game?.showInviteButton?.({ room: code })
      else sdk?.game?.hideInviteButton?.()
    } catch { /* ignore */ }
  })
}

// Share link for a room: the portal's own invite URL (never our site).
export async function portalInviteLink(code) {
  await ready
  try { return sdk?.game?.inviteLink?.({ room: code }) || null } catch { return null }
}

// Ref-counted and settled a tick later: recruit → battle unmounts and
// remounts the match screen in one commit, which must not read as a stop.
let playing = 0
let reported = false
export function portalGameplay(on) {
  playing += on ? 1 : -1
  queueMicrotask(() => {
    const want = playing > 0
    if (want === reported || !sdk) return
    reported = want
    try {
      if (want) sdk.game.gameplayStart()
      else sdk.game.gameplayStop()
    } catch { /* ignore */ }
  })
}
