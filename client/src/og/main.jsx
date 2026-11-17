import { createRoot } from 'react-dom/client'
import '../theme/tokens.css'
import '../theme/base.css'
import { SkinProvider } from '../skins/SkinContext'
import OgCard from './OgCard'

createRoot(document.getElementById('root')).render(
  <SkinProvider>
    <OgCard cover={new URLSearchParams(location.search).has('cover')} />
  </SkinProvider>,
)
