import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildIndex, candidates, fmtDist, navUrl, useGeo, walkMins } from '../geo'
import { STALE_MS, refreshPlace } from '../gmaps'
import { Icon } from '../components/Sprite'
import { SketchIcon } from '../components/Sketch'
import { MapView } from '../components/MapView'

export function ItemView({ itemId, edit }: { itemId: string; edit: (itemId: string) => void }) {
  const { pos, status } = useGeo()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const idx = useLiveQuery(async () => buildIndex(await db.places.toArray(), await db.brands.toArray()))
  const [picked, setPicked] = useState<string | undefined>()

  const cands = useMemo(() => (item && idx ? candidates(item, idx, pos) : []), [item, idx, pos])
  const sel = cands.find(c => c.place.id === picked) ?? cands[0]

  // Google only lets us cache coordinates for 30 days: quietly refresh stale ones when online
  useEffect(() => {
    const stale = cands.filter(c => Date.now() - c.place.fetchedAt > STALE_MS).slice(0, 10)
    if (!stale.length || !navigator.onLine) return
    ;(async () => {
      for (const c of stale) {
        try {
          const fresh = await refreshPlace(c.place)
          if (fresh) await db.places.put(fresh)
        } catch { /* offline or key problem: keep the old data */ }
      }
    })()
    // run once per item, not on every position update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, idx === undefined])

  if (item === undefined || !idx) return null
  if (!item) return <div className="page"><a href="#/" className="linkbtn">Back to lists</a></div>

  const mode = sel?.dist != null && sel.dist > 2500 ? 'transit' : 'walking'

  return (
    <div className="page with-cta">
      <div className="topbar">
        <a className="ibtn sk" href={`#/list/${item.listId}`} aria-label="Back to list"><Icon name="back" /></a>
        <div className={`chip sk fine ${item.tag === 'food' ? 'c-food' : 'c-things'}`}>
          <Icon name={item.tag === 'food' ? 'leaf' : 'bag'} size={18} />{item.tag === 'food' ? 'Food' : 'Things'}
        </div>
        <button className="ibtn sk" aria-label="Edit item" onClick={() => edit(item.id)}><Icon name="edit" /></button>
      </div>

      {cands.length > 0 && (
        <div className="mapcard sk">
          <span className="tape" />
          <MapView me={pos} places={cands.map(c => c.place)} selectedId={sel?.place.id} onSelect={setPicked} />
        </div>
      )}

      <div className="itemhead">
        <span className="ico big sk"><SketchIcon sketch={item.sketch} fallback={item.tag} /></span>
        <div>
          <h2 className="hand">{item.title}</h2>
          <span>{cands.length} {cands.length === 1 ? 'place' : 'places'} to buy it{item.done ? ' · bought' : ''}</span>
        </div>
      </div>

      {cands.length === 0 ? (
        <div className="empty sk">
          <span className="tape" />
          <p className="hand">No store pinned yet.</p>
          <p>Edit this item and search for a shop.</p>
        </div>
      ) : (
        <>
          <h3 className="h3 hand">{pos ? 'Closest first' : 'Saved places'}</h3>
          {!pos && <p className="note">{status === 'denied' ? 'Location is blocked, so the list is not sorted by distance.' : 'Waiting for your location…'}</p>}
          <ul className="places">
            {cands.map((c, i) => {
              const on = c.place.id === sel?.place.id
              return (
                <li key={c.place.id}>
                  <button className={'place sk fine' + (on ? ' sel' : '')} aria-pressed={on} onClick={() => setPicked(c.place.id)}>
                    <span className="no sk fine hand">{i + 1}</span>
                    <span>
                      <b>{c.place.name}</b>
                      <span className="store">{c.via ? `${c.via.name} branch` : 'Saved place'}{c.place.address ? ` · ${c.place.address}` : ''}</span>
                    </span>
                    {c.dist != null && <span className="dist"><b>{fmtDist(c.dist)}</b><small>{walkMins(c.dist)}</small></span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {sel && (
        <div className="cta">
          <a className="go sk" target="_blank" rel="noopener" href={navUrl(sel.place, mode)}>
            <Icon name="nav" /><span className="hand">{mode === 'walking' ? 'Walk to' : 'Go to'} {sel.place.name}</span>
          </a>
          <small>Opens Google Maps for turn-by-turn directions</small>
        </div>
      )}
    </div>
  )
}
