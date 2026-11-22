import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, importAll, importTripCsv, uid } from '../db'
import { resolveMapsLink } from '../gmaps'
import { useGeo } from '../geo'
import { Icon } from '../components/Sprite'
import { download } from '../download'

export function Lists({ go }: { go: (h: string) => void }) {
  const { status } = useGeo()
  const lists = useLiveQuery(() => db.lists.orderBy('createdAt').toArray())
  const counts = useLiveQuery(async () => {
    const items = await db.items.toArray()
    const m: Record<string, { n: number; done: number }> = {}
    for (const i of items) {
      const c = (m[i.listId] ??= { n: 0, done: 0 })
      c.n++; if (i.done) c.done++
    }
    return m
  })
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  async function add() {
    const n = name.trim()
    if (!n) return
    const id = uid()
    await db.lists.add({ id, name: n, createdAt: Date.now() })
    setName('')
    go(`#/list/${id}`)
  }

  async function doExport() {
    download(`pocket-pin-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), 'application/json')
    setNote('Backup saved to your downloads.')
  }

  async function doImport(f: File | undefined) {
    if (!f) return
    try {
      const text = await f.text()
      // A full backup is JSON; anything else is treated as a trip CSV from "Export trip CSV".
      if (/\.json$/i.test(f.name) || text.replace(/^\uFEFF/, '').trimStart().startsWith('{')) {
        const r = await importAll(text)
        setNote(`Imported ${r.lists} lists and ${r.items} items.`)
        return
      }
      setNote('Importing trip CSV…')
      const r = await importTripCsv(text, resolveMapsLink)
      const head = `Imported ${r.lists} ${r.lists === 1 ? 'trip' : 'trips'}, ${r.items} items and ${r.places} places.`
      const more = r.problems.length > 3 ? ` (+${r.problems.length - 3} more)` : ''
      setNote(r.problems.length ? `${head} Not everything came back: ${r.problems.slice(0, 3).join(' ')}${more}` : head)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Import failed.')
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <span className="ibtn-space" />
        <div className="here sk fine">
          <i className={status === 'ok' ? 'on' : ''} />
          {status === 'ok' ? 'Location on' : status === 'denied' ? 'Location blocked' : status === 'waiting' ? 'Locating…' : 'No location'}
        </div>
      </div>

      <h1 className="title hand">Pick my<br />pocket !</h1>

      {lists === undefined ? null : lists.length === 0 ? (
        <div className="empty sk">
          <span className="tape" />
          <p className="hand">Start with a list for your next trip :3</p>
          <p>Add things you want to buy, then pin the shops where you can find them</p>
        </div>
      ) : (
        <ul className="folders">
          {lists.map((l, i) => (
            <li key={l.id}>
              <a className="folder sk" href={`#/list/${l.id}`} style={{ ['--tc' as string]: ['var(--sky)', 'var(--pink)', 'var(--mustard)'][i % 3] }}>
                <span className="tape" />
                <b className="hand">{l.name}</b>
                <span>{counts?.[l.id] ? `${counts[l.id].n - counts[l.id].done} to buy · ${counts[l.id].done} bought` : 'Empty'}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <form className="newlist" onSubmit={e => { e.preventDefault(); add() }}>
        <label className="field sk fine">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="New list, e.g. Tokyo trip" aria-label="New list name" />
        </label>
        <button className="ibtn sk add" type="submit" aria-label="Create list"><Icon name="plus" /></button>
      </form>

      <div className="backup">
        <p>Your lists live only on this device (beta...). Back them up now and then!</p>
        <div className="seg">
          <button className="sk fine" onClick={doExport}>Export backup</button>
          <button className="sk fine" onClick={() => file.current?.click()}>Import backup</button>
        </div>
        <input ref={file} type="file" accept=".json,application/json,.csv,text/csv" hidden onChange={e => { doImport(e.target.files?.[0]); e.target.value = '' }} />
        {note && <p className="note">{note}</p>}
      </div>
    </div>
  )
}
