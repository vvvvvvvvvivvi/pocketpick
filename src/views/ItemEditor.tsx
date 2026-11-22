import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../db'
import { fmtDist, haversine, useGeo } from '../geo'
import { resolveMapsLink, searchBranches } from '../gmaps'
import { Icon } from '../components/Sprite'
import { SketchPad } from '../components/Sketch'
import { PlacePicker } from '../components/PlacePicker'
import type { Brand, Item, Place, Sketch, Tag } from '../types'

interface BrandScope { brand: Brand; branches: Place[] }

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-')

export function ItemEditor({ listId, itemId, onClose }: { listId: string; itemId?: string; onClose: () => void }) {
  const { pos } = useGeo()
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState<Tag>('food')
  const [sketch, setSketch] = useState<Sketch | undefined>()
  const [places, setPlaces] = useState<Place[]>([])
  const [scopes, setScopes] = useState<BrandScope[]>([])
  const [chainName, setChainName] = useState('')
  const [found, setFound] = useState<Place[] | null>(null)
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [mapsLink, setMapsLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(!itemId)
  const [existing, setExisting] = useState<Item | undefined>()
  const activeListId = existing?.listId ?? listId
  const list = useLiveQuery(() => activeListId ? db.lists.get(activeListId) : undefined, [activeListId])

  // load when editing
  useEffect(() => {
    if (!itemId) return
    ;(async () => {
      const it = await db.items.get(itemId)
      if (!it) { onClose(); return }
      setExisting(it)
      setTitle(it.title)
      setTag(it.tag)
      setSketch(it.sketch)
      const ps = (await db.places.bulkGet(it.placeIds)).filter((p): p is Place => !!p)
      setPlaces(ps)
      const sc: BrandScope[] = []
      for (const bid of it.brandIds) {
        const brand = await db.brands.get(bid)
        if (brand) sc.push({ brand, branches: await db.places.where('brandId').equals(bid).toArray() })
      }
      setScopes(sc)
      setLoaded(true)
    })()
  }, [itemId, onClose])

  function onPick(p: Place) {
    setMsg('')
    if (!places.some(x => x.id === p.id)) setPlaces(prev => [...prev, p])
  }

  async function importMapsLink() {
    if (!mapsLink.trim()) return
    setBusy(true); setMsg('')
    try {
      const place = await resolveMapsLink(mapsLink)
      setPlaces(prev => prev.some(p => p.id === place.id) ? prev : [...prev, place])
      setMapsLink('')
      setMsg(`Added ${place.name}.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not import that Google Maps link.')
    } finally {
      setBusy(false)
    }
  }

  async function findBranches() {
    if (!chainName.trim()) return
    setBusy(true); setMsg(''); setFound(null); setSelectedBranches([])
    try {
      const res = await searchBranches(chainName, list?.home ?? pos ?? undefined)
      setFound(res)
      setSelectedBranches([])
      if (res.length === 0) setMsg(`No results found for "${chainName.trim()}". Try another spelling.`)
    } catch {
      setMsg('Could not search Google Maps. Check that Places API (New) is enabled and the API key allows this site.')
    } finally {
      setBusy(false)
    }
  }

  function addSelectedBranches() {
    if (!found || selectedBranches.length === 0) return
    const name = chainName.trim()
    const brand: Brand = { id: `brand:${slug(name)}`, name, fetchedAt: Date.now() }
    const branches = found
      .filter(place => selectedBranches.includes(place.id))
      .map(place => ({ ...place, brandId: brand.id }))
    setScopes(prev => {
      const existingScope = prev.find(scope => scope.brand.id === brand.id)
      const merged = new Map((existingScope?.branches ?? []).map(place => [place.id, place]))
      for (const branch of branches) merged.set(branch.id, branch)
      return [...prev.filter(scope => scope.brand.id !== brand.id), { brand, branches: [...merged.values()] }]
    })
    setChainName('')
    setFound(null)
    setSelectedBranches([])
    setMsg(`Added ${branches.length} ${name} ${branches.length === 1 ? 'branch' : 'branches'}.`)
  }

  async function save() {
    if (!title.trim()) { setMsg('Give it a name first.'); return }
    const item: Item = {
      id: existing?.id ?? uid(),
      listId: existing?.listId ?? listId,
      title: title.trim(),
      tag,
      sketch,
      done: existing?.done ?? false,
      placeIds: places.map(p => p.id),
      brandIds: scopes.map(s => s.brand.id),
      createdAt: existing?.createdAt ?? Date.now()
    }
    await db.transaction('rw', db.items, db.places, db.brands, async () => {
      await db.places.bulkPut(places)
      for (const s of scopes) {
        await db.brands.put(s.brand)
        await db.places.bulkPut(s.branches) // keeps branches from other cities already stored under this chain
      }
      await db.items.put(item)
    })
    onClose()
  }

  async function remove() {
    if (existing && confirm(`Delete "${existing.title}"?`)) {
      await db.items.delete(existing.id)
      onClose()
    }
  }

  if (!loaded) return null

  // Distance from Home (or from you, if the list has no Home). Calculated locally from coordinates we already have.
  const ref = list?.home ?? pos
  const refLabel = list?.home ? 'Home' : 'you'
  const foundShown = found
    ? found
        .map(place => ({ place, dist: ref ? haversine(ref, place) : null }))
        .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0))
    : null

  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label={existing ? 'Edit item' : 'New item'}>
      <div className="sheet">
        <div className="topbar">
          <button className="ibtn sk" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
          <div className="hand h-title">{existing ? 'Edit thing' : 'New thing'}</div>
          <span className="ibtn-space" />
        </div>

        <label className="field sk fine">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you need?" aria-label="Item name" autoFocus={!existing} />
        </label>

        <div className="seg" role="group" aria-label="Tag">
          <button type="button" className="sk fine" aria-pressed={tag === 'food'} onClick={() => setTag('food')}><Icon name="leaf" size={19} />Food</button>
          <button type="button" className="sk fine" aria-pressed={tag === 'things'} onClick={() => setTag('things')}><Icon name="bag" size={19} />Things</button>
        </div>

        <SketchPad value={sketch} onChange={setSketch} />

        <h3 className="h3 hand">Where can you get it?</h3>

        {places.length > 0 && (
          <ul className="attached">
            {places.map(p => (
              <li key={p.id} className="found-row">
                <Icon name="pin" size={20} />
                <span>{p.name}</span>
                <button type="button" className="mini-x" aria-label={`Remove ${p.name}`} onClick={() => setPlaces(places.filter(x => x.id !== p.id))}><Icon name="x" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        {scopes.map(s => (
          <div key={s.brand.id} className="found-row any">
            <Icon name="star" size={20} />
            <span>Any {s.brand.name}</span>
            <small>{s.branches.length} branches</small>
            <button type="button" className="mini-x" aria-label={`Remove any ${s.brand.name}`} onClick={() => setScopes(scopes.filter(x => x !== s))}><Icon name="x" size={16} /></button>
          </div>
        ))}

        <p className="note">Add a specific shop, import a Maps link, or search for a chain directly.</p>
        <PlacePicker key={list?.home ? `${list.home.lat},${list.home.lng}` : 'no-home'} near={list?.home ?? pos} onPick={onPick} />

        <form className="maps-link-import" onSubmit={e => { e.preventDefault(); void importMapsLink() }}>
          <label className="field sk fine">
            <input value={mapsLink} onChange={e => setMapsLink(e.target.value)} aria-label="Google Maps link" placeholder="Paste a Google Maps link" type="url" />
          </label>
          <button type="submit" className="sk fine" disabled={busy || !mapsLink.trim()}>Import place</button>
        </form>

        <section className="chain-search">
          <h4 className="hand">Search for a chain</h4>
          <form onSubmit={e => { e.preventDefault(); void findBranches() }}>
            <label className="field sk fine small">
              <input value={chainName} onChange={e => setChainName(e.target.value)} aria-label="Chain name" placeholder="Chain name, e.g. Muji" />
            </label>
            <button type="submit" className="sk fine" disabled={busy || !chainName.trim()}>{busy ? 'Searching…' : 'Search branches'}</button>
          </form>
          {found && found.length > 0 && (
            <div className="branch-results">
              <p className="note">Choose the branches to include in this trip{ref ? ` (nearest ${refLabel} first)` : ''}.</p>
              {foundShown!.map(({ place, dist }) => (
                <label className="branch-option" key={place.id}>
                  <input
                    type="checkbox"
                    checked={selectedBranches.includes(place.id)}
                    onChange={() => setSelectedBranches(current => current.includes(place.id)
                      ? current.filter(id => id !== place.id)
                      : [...current, place.id])}
                  />
                  <span><b>{place.name}</b>{(dist != null || place.address) && <small>{[dist != null ? `${fmtDist(dist)} from ${refLabel}` : '', place.address].filter(Boolean).join(' · ')}</small>}</span>
                </label>
              ))}
              <button type="button" className="sk fine" disabled={selectedBranches.length === 0} onClick={addSelectedBranches}>
                Add {selectedBranches.length || ''} selected {selectedBranches.length === 1 ? 'branch' : 'branches'}
              </button>
            </div>
          )}
        </section>

        {msg && <p className="note warn">{msg}</p>}
        {existing && <button type="button" className="linkbtn" onClick={remove}>Delete this item</button>}
      </div>

      <div className="sheet-cta">
        <button className="go sk" onClick={save}><span className="hand">{existing ? 'Save changes' : 'Save to list'}</span></button>
      </div>
    </div>
  )
}