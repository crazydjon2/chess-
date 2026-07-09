import { useState } from 'react'
import OnlineApp from './OnlineApp'
import SandboxApp from './SandboxApp'
import PatchNotes from './rendering/PatchNotes'
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

  if (mode === 'online') return <OnlineApp onExit={() => setMode(null)} />
  if (mode === 'sandbox') return <SandboxApp onExit={() => setMode(null)} />

  function openPatchNotes() {
    setPatchNotesOpen(true)
    setUnseenPatch(false)
    markPatchSeen()
  }

  return (
    <div className="mode-select-screen">
      {patchNotesOpen && <PatchNotes onClose={() => setPatchNotesOpen(false)} />}
      <div className="mode-select-title">Chess+</div>
      <button className="mode-select-btn" onClick={() => setMode('online')}>Играть онлайн</button>
      <button className="mode-select-btn sandbox" onClick={() => setMode('sandbox')}>
        Песочница <span className="mode-select-hint">(все скиллы, тест руками)</span>
      </button>
      <button className={`mode-select-patchnotes${unseenPatch ? ' unseen' : ''}`} onClick={openPatchNotes}>
        <span className="mode-select-patchnotes-glyph">📜</span> Что нового
        {unseenPatch && <span className="mode-select-patchnotes-dot" />}
      </button>
    </div>
  )
}
