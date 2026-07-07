import { useState } from 'react'
import OnlineApp from './OnlineApp'
import SandboxApp from './SandboxApp'
import './App.css'

export default function App() {
  const [mode, setMode] = useState(null) // null | 'online' | 'sandbox'

  if (mode === 'online') return <OnlineApp onExit={() => setMode(null)} />
  if (mode === 'sandbox') return <SandboxApp onExit={() => setMode(null)} />

  return (
    <div className="mode-select-screen">
      <div className="mode-select-title">Chess+</div>
      <button className="mode-select-btn" onClick={() => setMode('online')}>Играть онлайн</button>
      <button className="mode-select-btn sandbox" onClick={() => setMode('sandbox')}>
        Песочница <span className="mode-select-hint">(все скиллы, тест руками)</span>
      </button>
    </div>
  )
}
