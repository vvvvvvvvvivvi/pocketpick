import { useCallback, useEffect, useState } from 'react'
import { GeoContext, useWatchPosition } from './geo'
import { MAPS_KEY } from './gmaps'
import { Sprite } from './components/Sprite'
import { Lists } from './views/Lists'
import { ListView } from './views/ListView'
import { ItemView } from './views/ItemView'
import { ItemEditor } from './views/ItemEditor'

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/')
  useEffect(() => {
    const on = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function App() {
  const geo = useWatchPosition()
  const hash = useHash()
  const go = useCallback((h: string) => { location.hash = h }, [])
  const [editor, setEditor] = useState<{ listId: string; itemId?: string } | null>(null)

  const [, kind, id] = hash.split('/')
  let view
  if (kind === 'list' && id) view = <ListView listId={id} go={go} edit={itemId => setEditor({ listId: id, itemId })} />
  else if (kind === 'item' && id) view = <ItemView itemId={id} edit={itemId => setEditor({ listId: '', itemId })} />
  else view = <Lists go={go} />

  return (
    <GeoContext.Provider value={geo}>
      <Sprite />
      {!MAPS_KEY && (
        <div className="banner">For Vivian: No Google Maps key found. Lists work, but search and maps are off. Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>.env</code>.</div>
      )}
      {view}
      {editor && <ItemEditor listId={editor.listId} itemId={editor.itemId} onClose={() => setEditor(null)} />}
    </GeoContext.Provider>
  )
}
