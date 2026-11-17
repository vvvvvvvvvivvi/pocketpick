import { useEffect, useState } from 'react'
import { db, uid } from '../db'
import { useGeo } from '../geo'
import { searchBranches } from '../gmaps'
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
  const [pending, setPending] = useState<Place | null>(null)
  const [brandName, setBrandName] = useState('')
  const [found, setFound] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(!itemId)
  const [existing, setExisting] = useState<Item | undefined>()

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
    setPending(p)
    setBrandName(p.name)
    setFound(null)
  }

  async function findBranches() {
    if (!pending || !brandName.trim()) return
    setBusy(true); setMsg('')
    try {
      const res = await searchBranches(brandName, { lat: pending.lat, lng: pending.lng })
      setFound(res)
      if (res.length < 2) setMsg(`Only ${res.length} match for "${brandName.trim()}". Try the chain's name on its own, e.g. "Muji".`)
    } catch {
      setMsg('Branch search needs a connection.')
    } finally {
      setBusy(false)
    }
  }

  function useAnyBranch() {
    if (!pending || !found) return
    const brand: Brand = { id: `brand:${slug(brandName)}`, name: brandName.trim(), fetchedAt: Date.now() }
    const branches = found.map(p => ({ ...p, brandId: brand.id }))
    setPlaces(prev => prev.map(p => (p.id === pending.id ? { ...p, brandId: brand.id } : p)))
    setScopes(prev => [...prev.filter(s => s.brand.id !== brand.id), { brand, branches }])
    setPending(null); setFound(null)
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

        <PlacePicker near={pos} onPick={onPick} />

        {pending && (
          <div className="found sk">
            <span className="tape" />
            <p>Is <b>{pending.name}</b> part of a chain?</p>
            <div className="field sk fine small">
              <input value={brandName} onChange={e => setBrandName(e.target.value)} aria-label="Chain name" placeholder="Chain name, e.g. Muji" />
            </div>
            {found === null ? (
              <div className="seg">
                <button type="button" className="sk fine" onClick={() => setPending(null)}>Just this one</button>
                <button type="button" className="sk fine" onClick={findBranches} disabled={busy}>{busy ? 'Looking…' : 'Find branches'}</button>
              </div>
            ) : (
              <>
                <p className="preview">Found <strong>{found.length}</strong> near here.</p>
                <div className="seg">
                  <button type="button" className="sk fine" onClick={() => { setPending(null); setFound(null) }}>This one only</button>
                  <button type="button" className="sk fine" aria-pressed="true" onClick={useAnyBranch} disabled={found.length < 1}>Any branch · {found.length}</button>
                </div>
              </>
            )}
          </div>
        )}

        {msg && <p className="note warn">{msg}</p>}
        {existing && <button type="button" className="linkbtn" onClick={remove}>Delete this item</button>}
      </div>

      <div className="sheet-cta">
        <button className="go sk" onClick={save}><span className="hand">{existing ? 'Save changes' : 'Save to list'}</span></button>
      </div>
    </div>
  )
}
