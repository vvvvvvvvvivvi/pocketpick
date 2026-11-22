import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteList, exportListCsv, uid } from '../db'
import { buildIndex, candidates, fmtDist, storeLabel, useGeo, walkMins } from '../geo'
import { resolveMapsLink } from '../gmaps'
import { download } from '../download'
import { buildRows, toKml } from '../mymaps'
import { Icon } from '../components/Sprite'
import { MapView } from '../components/MapView'
import { PlacePicker } from '../components/PlacePicker'
import { SketchIcon } from '../components/Sketch'
import type { Item, Place } from '../types'

type Filter = 'all' | 'food' | 'things'
const WALK_M = 800 // roughly a 10 minute walk
const ignorePlaceSelection = () => {}

export function ListView({ listId, go, edit }: { listId: string; go: (h: string) => void; edit: (itemId?: string) => void }) {
  const { pos, status } = useGeo()
  const list = useLiveQuery(() => db.lists.get(listId), [listId])
  const items = useLiveQuery(() => db.items.where('listId').equals(listId).toArray(), [listId])
  const idx = useLiveQuery(async () => buildIndex(await db.places.toArray(), await db.brands.toArray()))
  const [filter, setFilter] = useState<Filter>('all')
  const [mapVisible, setMapVisible] = useState(true)
  const [droppingHome, setDroppingHome] = useState(false)
  const [searchingHome, setSearchingHome] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importNote, setImportNote] = useState('')
  const [importing, setImporting] = useState(false)
  const [actionNote, setActionNote] = useState('')

  const rows = useMemo(() => {
    if (!items || !idx) return []
    return items.map(item => {
      const near = candidates(item, idx, pos)[0]
      return { item, near, label: storeLabel(item, idx) }
    }).sort((a, b) => {
      if (a.item.done !== b.item.done) return a.item.done ? 1 : -1
      const da = a.near?.dist ?? Infinity, dbb = b.near?.dist ?? Infinity
      return da !== dbb ? da - dbb : a.item.createdAt - b.item.createdAt
    })
  }, [items, idx, pos])
  const mapPlaces = useMemo(() => {
    if (!items || !idx) return []
    const saved = new Map<string, Place>()
    for (const item of items) {
      for (const candidate of candidates(item, idx, null)) saved.set(candidate.place.id, candidate.place)
    }
    return [...saved.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, idx])

  if (list === undefined || items === undefined) return null
  if (!list) return <div className="page"><p className="note">That list no longer exists...</p><a href="#/" className="linkbtn">Back to lists</a></div>

  const counts = { all: items.length, food: items.filter(i => i.tag === 'food').length, things: items.filter(i => i.tag === 'things').length }
  const closeCount = rows.filter(r => !r.item.done && r.near?.dist != null && r.near.dist <= WALK_M).length
  const shown = rows.filter(r => filter === 'all' || r.item.tag === filter)

  async function toggle(i: Item) { await db.items.update(i.id, { done: !i.done }) }

  async function rename() {
    const n = prompt('Rename list', list!.name)?.trim()
    if (n) await db.lists.update(listId, { name: n })
  }
  async function remove() {
    if (confirm(`Delete "${list!.name}" and its ${items!.length} items?`)) {
      await deleteList(listId)
      go('#/')
    }
  }

  async function setHome(home: { lat: number; lng: number }, name: string) {
    try {
      const updated = await db.lists.update(listId, { home, homeName: name })
      if (!updated) throw new Error('That trip no longer exists.')
      setDroppingHome(false)
      setSearchingHome(false)
      setActionNote(`Home set to ${name}.`)
    } catch (e) {
      setActionNote(e instanceof Error ? `Could not set Home: ${e.message}` : 'Could not set Home.')
    }
  }

  async function clearHome() {
    try {
      await db.lists.update(listId, { home: undefined, homeName: undefined })
      setActionNote('Home cleared.')
    } catch (e) {
      setActionNote(e instanceof Error ? `Could not clear Home: ${e.message}` : 'Could not clear Home.')
    }
  }

  async function downloadCsv() {
    try {
      const csv = await exportListCsv(listId)
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safeName = list.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip'
      a.href = url
      a.download = `${safeName}.csv`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setActionNote('Trip CSV downloaded.')
    } catch (e) {
      setActionNote(e instanceof Error ? e.message : 'Could not export this trip.')
    }
  }

  /** KML for Google My Maps: each item becomes its own layer. Built from saved data, so it makes no Google request. */
  function downloadKml() {
    const rows = buildRows(list!.name, items!, item => (idx ? candidates(item, idx, null) : []))
    if (!rows.length) {
      setActionNote('None of the items have a store pinned yet.')
      return
    }
    const safeName = list!.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip'
    download(`${safeName}.kml`, toKml(list!.name, rows), 'application/vnd.google-earth.kml+xml')
    setActionNote('KML downloaded. Import it at mymaps.google.com (Add layer → Import).')
  }

  async function importMapsLinks() {
    const links = importText.split(/\r?\n/).map(link => link.trim()).filter(Boolean)
    if (!links.length) {
      setImportNote('Paste one Google Maps link per line.')
      return
    }
    setImporting(true)
    setImportNote('Resolving places…')
    const resolved: Place[] = []
    const errors: string[] = []
    for (const [index, link] of links.entries()) {
      try {
        resolved.push(await resolveMapsLink(link))
      } catch (e) {
        errors.push(`Line ${index + 1}: ${e instanceof Error ? e.message : 'Could not resolve this link.'}`)
      }
    }
    try {
      if (resolved.length) {
        const now = Date.now()
        const imported: Item[] = resolved.map(place => ({
          id: uid(),
          listId,
          title: place.name,
          tag: 'things',
          done: false,
          placeIds: [place.id],
          brandIds: [],
          createdAt: now
        }))
        await db.transaction('rw', db.items, db.places, async () => {
          await db.places.bulkPut(resolved)
          await db.items.bulkAdd(imported)
        })
      }
      setImportNote([
        resolved.length ? `Imported ${resolved.length} ${resolved.length === 1 ? 'place' : 'places'} as trip items.` : '',
        ...errors
      ].filter(Boolean).join(' '))
      if (!errors.length) setImportText('')
    } catch (e) {
      setImportNote(e instanceof Error ? `Could not save imported places: ${e.message}` : 'Could not save imported places.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <a className="ibtn sk" href="#/" aria-label="Back to lists"><Icon name="back" /></a>
        <div className="hand h-title">{list.name}</div>
        <details className="menu">
          <summary className="ibtn sk" aria-label="List options"><Icon name="more" /></summary>
          <div className="menu-pop sk">
            <button onClick={rename}>Rename</button>
            <button onClick={() => setMapVisible(value => !value)}>{mapVisible ? 'Hide trip map' : 'Show trip map'}</button>
            <button onClick={() => { setImportOpen(true); setImportNote('') }}>Import Maps links</button>
            <button onClick={() => void downloadCsv()}>Export trip CSV</button>
            <button onClick={downloadKml}>Export KML (My Maps)</button>
            <button onClick={remove}>Delete list</button>
          </div>
        </details>
      </div>

      {mapVisible && (
        <section className="trip-map-section">
          <h3 className="h3 hand">Trip map</h3>
          <div className="mapcard list-mapcard sk">
            <MapView
              me={null}
              places={mapPlaces}
              center={list.home ?? null}
              home={list.home ?? null}
              showAll
              onSelect={ignorePlaceSelection}
              onMapClick={droppingHome ? location => void setHome(location, 'Dropped pin') : undefined}
            />
          </div>
          <div className="map-tools">
            <button className="sk fine" aria-pressed={droppingHome} onClick={() => { setDroppingHome(value => !value); setSearchingHome(false) }}>
              {droppingHome ? 'Cancel pin drop' : 'Drop Home pin'}
            </button>
            <button className="sk fine" onClick={() => { setSearchingHome(value => !value); setDroppingHome(false) }}>
              {searchingHome ? 'Close Home search' : 'Search Home'}
            </button>
            {list.home && <button className="map-clear" onClick={() => void clearHome()}>Clear Home</button>}
          </div>
          {droppingHome && <p className="note">Tap the map where you want Home to be.</p>}
          {searchingHome && (
            <PlacePicker
              near={list.home ?? pos}
              placeholder="Search for a Home location"
              onPick={place => void setHome(place, place.name)}
            />
          )}
          {mapPlaces.length === 0 && <p className="note">Add places to items to see them on the trip map.</p>}
        </section>
      )}
      {actionNote && <p className="note">{actionNote}</p>}

      {status === 'ok' && closeCount > 0 && (
        <div className="sticky sk">
          <span className="tape" />
          <b className="hand">{closeCount} {closeCount === 1 ? 'thing' : 'things'}</b> within a 10 min walk
          <small>Updated as you move</small>
        </div>
      )}
      {status !== 'ok' && items.length > 0 && (
        <p className="note">{status === 'denied' ? 'Location is blocked, so distances are hidden. Allow it in your browser settings.' : status === 'waiting' ? 'Finding you…' : 'No location available, so items are not sorted by distance.'}</p>
      )}

      <div className="chips" role="group" aria-label="Filter by tag">
        <button className="chip sk fine c-all" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {counts.all}</button>
        <button className="chip sk fine c-food" aria-pressed={filter === 'food'} onClick={() => setFilter('food')}><Icon name="leaf" size={18} />Food {counts.food}</button>
        <button className="chip sk fine c-things" aria-pressed={filter === 'things'} onClick={() => setFilter('things')}><Icon name="bag" size={18} />Things {counts.things}</button>
      </div>

      {items.length === 0 && (
        <div className="empty sk">
          <span className="tape" />
          <p className="hand">Nothing here yet...</p>
          <p>Tap the red button to add your first thing...!</p>
        </div>
      )}

      <ul className="rows">
        {shown.map(({ item, near, label }) => (
          <li key={item.id} className={'row sk fine' + (item.done ? ' done' : '')}>
            <button className="chk sk fine" aria-pressed={item.done} aria-label={`Mark ${item.title} as ${item.done ? 'not bought' : 'bought'}`} onClick={() => toggle(item)}>
              <svg viewBox="0 0 24 24"><use href="#i-check" /></svg>
            </button>
            <a className="rowlink" href={`#/item/${item.id}`}>
              <span className="ico sk fine"><SketchIcon sketch={item.sketch} fallback={item.tag} /></span>
              <span className="meta">
                <b>{item.title}</b>
                <span className="store">{label.name}{label.extra && <> <em>{label.extra}</em></>}</span>
              </span>
              <span className="dist">
                {near?.dist != null ? <><b>{fmtDist(near.dist)}</b><small>{walkMins(near.dist)}</small></> : <small>{near ? '' : 'no store'}</small>}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <button className="fab sk" aria-label="Add item" onClick={() => edit()}><Icon name="plus" size={28} /></button>

      {importOpen && (
        <div className="sheet-back import-sheet" role="dialog" aria-modal="true" aria-label="Import Google Maps links">
          <div className="sheet">
            <div className="topbar">
              <button className="ibtn sk" aria-label="Close" onClick={() => setImportOpen(false)}><Icon name="x" /></button>
              <div className="hand h-title">Import Maps links</div>
              <span className="ibtn-space" />
            </div>
            <p className="note">Paste one full Google Maps URL per line. Each link becomes an item in this trip.</p>
            <label className="field sk fine link-list">
              <textarea value={importText} onChange={e => setImportText(e.target.value)} aria-label="Google Maps links" placeholder={'https://www.google.com/maps/place/…'} />
            </label>
            {importNote && <p className="note warn">{importNote}</p>}
            <button className="go sk" disabled={importing} onClick={() => void importMapsLinks()}>
              <span className="hand">{importing ? 'Importing…' : 'Import places'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}