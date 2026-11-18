import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, importAll, uid } from '../db'
import { useGeo } from '../geo'
import { Icon } from '../components/Sprite'

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
    const blob = new Blob([await exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pocket-pin-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setNote('Backup saved to your downloads.')
  }

  async function doImport(f: File | undefined) {
    if (!f) return
    try {
      const r = await importAll(await f.text())
      setNote(`Imported ${r.lists} lists and ${r.items} items.`)
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
        <input ref={file} type="file" accept="application/json" hidden onChange={e => { doImport(e.target.files?.[0]); e.target.value = '' }} />
        {note && <p className="note">{note}</p>}
      </div>
    </div>
  )
}
