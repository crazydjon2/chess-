import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router'
import './theme/tokens.css'
import './theme/base.css'
import App from './App.jsx'
import { SkinProvider } from './skins/SkinContext'
import { applyTheme, savedThemeId } from './theme/themes'
import { installInteractions } from './theme/interactions'
import { trackVisit } from './analytics'
import { getLang } from './i18n'
import { PORTAL, initPortal } from './portal'

applyTheme(savedThemeId())
installInteractions()
initPortal()
trackVisit(getLang())

// Portal mode (?portal=…, see portal.js): the portal's iframe URL must stay
// as given, so routes live in the hash there (#/room/KX92F).
const Router = PORTAL ? HashRouter : BrowserRouter

// No StrictMode wrapper — its dev-mode double-render/double-effect pass
// made every screen switch do its mount work twice (including OnlineApp's
// socket connect→disconnect→connect churn), which is exactly the moment
// the page-transition animations start; the doubled long task ate their
// first frames and the card entrances visibly stuttered. Production
// builds never ran the doubles anyway, so this only changes (improves)
// how dev feels.
createRoot(document.getElementById('root')).render(
  <Router>
    <SkinProvider>
      <App />
    </SkinProvider>
  </Router>,
)
