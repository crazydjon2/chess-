import AmbientBackground from './ui/AmbientBackground'
import './MenuLayout.css'

// The app's backdrop — mounted once in App.jsx so it never resets between
// screens. Each screen brings its own header (settings lives there now).
export default function MenuLayout({ children }) {
  return (
    <div className="ml-root">
      <div className="ui-bg" />
      <AmbientBackground />
      {children}
    </div>
  )
}
