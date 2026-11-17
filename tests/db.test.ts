import 'fake-indexeddb/auto'
import { db, uid, exportAll, importAll, deleteList } from '../src/db.ts'
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1) } else console.log('ok  ', m) }

const listId = uid()
await db.lists.add({ id: listId, name: 'Tokyo trip', createdAt: 1 })
await db.places.bulkPut([{ id: 'p1', name: 'Muji Shibuya', lat: 35.66, lng: 139.7, brandId: 'brand:muji', fetchedAt: 1 }])
await db.brands.put({ id: 'brand:muji', name: 'Muji', fetchedAt: 1 })
await db.items.add({ id: uid(), listId, title: 'Gel pens', tag: 'things', done: false, placeIds: ['p1'], brandIds: ['brand:muji'], createdAt: 1,
  sketch: { strokes: [{ c: '#000', p: [[0, 0], [5, 5]] }], vb: [0, 0, 10, 10] } })

const dump = await exportAll()
assert(JSON.parse(dump).items.length === 1, 'export contains the item')

await deleteList(listId)
assert((await db.items.count()) === 0 && (await db.lists.count()) === 0, 'deleting a list removes its items')

const r = await importAll(dump)
assert(r.lists === 1 && r.items === 1, 'import restores list + item')
const back = (await db.items.toArray())[0]
assert(back.sketch?.strokes.length === 1 && back.brandIds[0] === 'brand:muji', 'sketch and brand survive round-trip')
assert((await db.places.where('brandId').equals('brand:muji').count()) === 1, 'brandId index query works')

let threw = false
try { await importAll('{"hello":1}') } catch { threw = true }
assert(threw, 'rejects a file that is not a Pocket Pin export')
