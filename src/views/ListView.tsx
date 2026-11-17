import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteList } from '../db'
import { buildIndex, candidates, fmtDist, storeLabel, useGeo, walkMins } from '../geo'
import { Icon } from '../components/Sprite'
import { SketchIcon } from '../components/Sketch'
import type { Item } from '../types'

type Filter = 'all' | 'food' | 'things'
const WALK_M = 800 // roughly a 10 minute walk

export function ListView({ listId, go, edit }: { listId: string; go: (h: string) => void; edit: (itemId?: string) => void }) {
  const { pos, status } = useGeo()
  const list = useLiveQuery(() => db.lists.get(listId), [listId])
  const items = useLiveQuery(() => db.items.where('listId').equals(listId).toArray(), [listId])
  const idx = useLiveQuery(async () => buildIndex(await db.places.toArray(), await db.brands.toArray()))
  const [filter, setFilter] = useState<Filter>('all')

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

  if (list === undefined || items === undefined) return null
  if (!list) return <div className="page"><p className="note">That list no longer exists.</p><a href="#/" className="linkbtn">Back to lists</a></div>

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

  return (
    <div className="page">
      <div className="topbar">
        <a className="ibtn sk" href="#/" aria-label="Back to lists"><Icon name="back" /></a>
        <div className="hand h-title">{list.name}</div>
        <details className="menu">
          <summary className="ibtn sk" aria-label="List options"><Icon name="more" /></summary>
          <div className="menu-pop sk">
            <button onClick={rename}>Rename</button>
            <button onClick={remove}>Delete list</button>
          </div>
        </details>
      </div>

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
          <p className="hand">Nothing here yet.</p>
          <p>Tap the red button to add your first thing.</p>
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
    </div>
  )
}
