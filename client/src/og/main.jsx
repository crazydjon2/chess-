import { createRoot } from 'react-dom/client'
import '../theme/tokens.css'
import '../theme/base.css'
import { SkinProvider } from '../skins/SkinContext'
import OgCard from './OgCard'
import StoreArt from './StoreArt'

const q = new URLSearchParams(location.search)

createRoot(document.getElementById('root')).render(
  <SkinProvider>
    {q.get('store') ? <StoreArt kind={q.get('store')} shots={q.get('shots')} /> : <OgCard variant={q.has('cover') ? 'cover' : ''} />}
  </SkinProvider>,
)
