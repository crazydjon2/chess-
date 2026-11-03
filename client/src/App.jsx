import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import OnlineApp from './OnlineApp'
import SandboxApp from './SandboxApp'
import PatchNotes from './rendering/PatchNotes'
import MainMenu from './rendering/MainMenu'
import MenuLayout from './rendering/MenuLayout'
import PageTransition from './rendering/PageTransition'
import { PATCH_NOTES } from './game/patchNotes'
import './App.css'

const PATCH_SEEN_KEY = 'chessplus_patchnotes_seen'
const latestPatchId = PATCH_NOTES[0].id

// Same try/catch-and-fall-through pattern as nickname.js — localStorage can
// be unavailable (privacy mode, etc.); worst case the "new patch" badge just
// reappears next visit instead of crashing the menu.
function hasUnseenPatch() {
  try {
    return localStorage.getItem(PATCH_SEEN_KEY) !== latestPatchId
  } catch {
    return false
  }
}

function markPatchSeen() {
  try {
    localStorage.setItem(PATCH_SEEN_KEY, latestPatchId)
  } catch {
    // Ignore — badge just won't stay dismissed across reloads here.
  }
}

// Top-level screen from the URL: / menu, /online room browser, /room/:code
// a room, /sandbox. /online and /room/:code are both the SAME 'online'
// screen — OnlineApp stays mounted (socket and all) while moving between
// browser and room, and does its own inner page transitions there. Any
// unknown path falls back to the menu.
function modeFor(pathname) {
  if (pathname === '/online' || pathname.startsWith('/room/')) return 'online'
  if (pathname === '/sandbox') return 'sandbox'
  return null
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const mode = modeFor(location.pathname) // null | 'online' | 'sandbox'
  const [patchNotesOpen, setPatchNotesOpen] = useState(false)

  // Old-style invite links (…/?room=KX92F) still work — forwarded to the
  // room's own address.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('room')
    if (code) navigate(`/room/${code.trim().toUpperCase()}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [unseenPatch, setUnseenPatch] = useState(hasUnseenPatch)

  function openPatchNotes() {
    setPatchNotesOpen(true)
    setUnseenPatch(false)
    markPatchSeen()
  }

  // MenuLayout wraps every mode (not just the menu) and is mounted exactly
  // once here — that's what keeps its background/floating pieces from
  // resetting every time `mode` changes. Sandbox/online screens paint
  // their own full-viewport background over it, so it's simply invisible
  // (not absent) whenever those are active.
  return (
    <MenuLayout>
      <PageTransition pageKey={mode ?? 'menu'} noExitSnapshotFor={['online', 'sandbox']}>
        {mode === 'online' && <OnlineApp onExit={() => navigate('/')} />}
        {mode === 'sandbox' && <SandboxApp onExit={() => navigate('/')} />}
        {mode === null && (
          <>
            {patchNotesOpen && <PatchNotes onClose={() => setPatchNotesOpen(false)} />}
            <MainMenu
              onPlayOnline={() => navigate('/online')}
              onSandbox={() => navigate('/sandbox')}
              onOpenPatchNotes={openPatchNotes}
              unseenPatch={unseenPatch}
            />
          </>
        )}
      </PageTransition>
    </MenuLayout>
  )
}
