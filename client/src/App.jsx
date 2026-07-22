import { useState } from 'react'
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

export default function App() {
  const [mode, setMode] = useState(null) // null | 'online' | 'sandbox'
  const [patchNotesOpen, setPatchNotesOpen] = useState(false)
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
        {mode === 'online' && <OnlineApp onExit={() => setMode(null)} />}
        {mode === 'sandbox' && <SandboxApp onExit={() => setMode(null)} />}
        {mode === null && (
          <>
            {patchNotesOpen && <PatchNotes onClose={() => setPatchNotesOpen(false)} />}
            <MainMenu
              onPlayOnline={() => setMode('online')}
              onSandbox={() => setMode('sandbox')}
              onOpenPatchNotes={openPatchNotes}
              unseenPatch={unseenPatch}
            />
          </>
        )}
      </PageTransition>
    </MenuLayout>
  )
}
