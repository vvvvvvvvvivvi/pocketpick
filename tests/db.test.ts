import 'fake-indexeddb/auto'
import { db, uid, exportAll, exportListCsv, importAll, importTripCsv, parseCsv, deleteList } from '../src/db.ts'
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1) } else console.log('ok  ', m) }

const listId = uid()
await db.lists.add({ id: listId, name: 'Tokyo trip', createdAt: 1, home: { lat: 35.6, lng: 139.7 }, homeName: 'Home, Tokyo' })
await db.places.bulkPut([{ id: 'p1', name: 'Muji Shibuya', lat: 35.66, lng: 139.7, brandId: 'brand:muji', fetchedAt: 1 }])
await db.brands.put({ id: 'brand:muji', name: 'Muji', fetchedAt: 1 })
await db.items.add({ id: uid(), listId, title: 'Gel pens', tag: 'things', done: false, placeIds: ['p1'], brandIds: ['brand:muji'], createdAt: 1,
  sketch: { strokes: [{ c: '#000', p: [[0, 0], [5, 5]] }], vb: [0, 0, 10, 10] } })

const dump = await exportAll()
assert(JSON.parse(dump).items.length === 1, 'export contains the item')
const tripCsv = await exportListCsv(listId)
assert(tripCsv.includes('"Tokyo trip"') && tripCsv.includes('"Gel pens"'), 'trip CSV contains trip and item')
assert(tripCsv.includes('"Home, Tokyo"') && tripCsv.includes('"Muji · Muji Shibuya"'), 'trip CSV contains home and chain branch details')
assert(tripCsv.includes('query_place_id=p1'), 'trip CSV links saved places to Google Maps')

await deleteList(listId)
assert((await db.items.count()) === 0 && (await db.lists.count()) === 0, 'deleting a list removes its items')

const r = await importAll(dump)
assert(r.lists === 1 && r.items === 1, 'import restores list + item')
const restoredList = await db.lists.get(listId)
assert(restoredList?.homeName === 'Home, Tokyo' && restoredList.home?.lat === 35.6, 'trip Home survives backup round-trip')
const back = (await db.items.toArray())[0]
assert(back.sketch?.strokes.length === 1 && back.brandIds[0] === 'brand:muji', 'sketch and brand survive round-trip')
assert((await db.places.where('brandId').equals('brand:muji').count()) === 1, 'brandId index query works')

let threw = false
try { await importAll('{"hello":1}') } catch { threw = true }
assert(threw, 'rejects a file that is not a Pocket Pin export')

// --- Trip CSV import ---
await Promise.all([db.lists.clear(), db.items.clear(), db.places.clear(), db.brands.clear()])
const tripId = uid()
await db.lists.add({ id: tripId, name: 'Osaka, "food" run', createdAt: 1, home: { lat: 34.7, lng: 135.5 }, homeName: 'Hotel' })
await db.places.bulkPut([
  { id: 'p1', name: 'Muji Namba', address: '1 Namba', lat: 34.66, lng: 135.5, brandId: 'brand:muji', fetchedAt: 1 },
  { id: 'p2', name: 'Muji Umeda', lat: 34.7, lng: 135.49, brandId: 'brand:muji', fetchedAt: 1 },
  { id: 'p3', name: '=Takoyaki', lat: 34.67, lng: 135.51, fetchedAt: 1 },
  { id: 'pin:-33.8,151.2', name: 'Pinned map location', lat: -33.8, lng: 151.2, fetchedAt: 1 }
])
await db.brands.put({ id: 'brand:muji', name: 'Muji', fetchedAt: 1 })
await db.items.bulkAdd([
  { id: uid(), listId: tripId, title: 'Notebook', tag: 'things', done: true, placeIds: [], brandIds: ['brand:muji'], createdAt: 1 },
  { id: uid(), listId: tripId, title: 'Takoyaki', tag: 'food', done: false, placeIds: ['p3', 'pin:-33.8,151.2'], brandIds: [], createdAt: 2 },
  { id: uid(), listId: tripId, title: 'Line 1\nline 2', tag: 'things', done: false, placeIds: [], brandIds: [], createdAt: 3 }
])
const osakaCsv = await exportListCsv(tripId)
await deleteList(tripId)
await Promise.all([db.places.clear(), db.brands.clear()])

let calls = 0
const res = await importTripCsv(osakaCsv, async () => { calls++; throw new Error('should not be called') })
assert(calls === 0, 'CSV with coordinates imports without any Google lookup')
assert(res.lists === 1 && res.items === 3 && res.places === 4 && res.problems.length === 0, 'CSV import reports 1 trip, 3 items, 4 places')
const trip = (await db.lists.toArray())[0]
assert(trip.name === 'Osaka, "food" run' && trip.homeName === 'Hotel' && trip.home?.lng === 135.5, 'trip name (quotes, comma) and Home restored')
const got = await db.items.where('listId').equals(trip.id).toArray()
const nb = got.find(i => i.title === 'Notebook')!
assert(nb.done && nb.brandIds[0] === 'brand:muji' && nb.placeIds.length === 0, 'chain item restored as "any branch" with status')
assert((await db.places.where('brandId').equals('brand:muji').count()) === 2 && (await db.brands.get('brand:muji'))?.name === 'Muji', 'chain branches and brand restored')
const tk = got.find(i => i.title === 'Takoyaki')!
assert(tk.tag === 'food' && tk.placeIds.join() === 'p3,pin:-33.8,151.2', 'specific places restored, including a pin')
assert((await db.places.get('p3'))?.name === '=Takoyaki' && (await db.places.get('p1'))?.address === '1 Namba', 'formula guard undone, address kept')
assert((await db.places.get('p1'))?.fetchedAt === 0, 'imported coordinates are marked for refresh')
assert(got.some(i => i.title === 'Line 1\nline 2'), 'item without places and with a newline restored')

// Older CSVs (no Chain/Latitude/Longitude columns) resolve each distinct link once.
const oldCsv = [
  '"Trip","Home","Home latitude","Home longitude","Item","Category","Status","Store or branch","Address","Google Maps URL"',
  '"Kyoto","","","","Matcha","food","To buy","Ippodo","","https://www.google.com/maps/search/?api=1&query=Ippodo&query_place_id=q1"',
  '"Kyoto","","","","Socks","things","To buy","Muji · Muji Kyoto","","https://www.google.com/maps/search/?api=1&query=Muji%20Kyoto&query_place_id=q2"',
  '"Kyoto","","","","Tea cup","things","To buy","Ippodo","","https://www.google.com/maps/search/?api=1&query=Ippodo&query_place_id=q1"',
  '"Kyoto","","","","Pen","things","To buy","Gone","","https://www.google.com/maps/search/?api=1&query=Gone&query_place_id=q3"'
].join('\r\n')
const seen: string[] = []
const res2 = await importTripCsv(oldCsv, async url => {
  const id = new URL(url).searchParams.get('query_place_id')!
  seen.push(id)
  if (id === 'q3') throw new Error('Place closed.')
  return { id, name: id, lat: 35, lng: 135.7, fetchedAt: 5 }
})
assert(seen.join() === 'q1,q2,q3', 'old CSV: each distinct link resolved once')
assert(res2.items === 4 && res2.problems.length === 1 && res2.problems[0].includes('Place closed.'), 'unresolvable place reported, item still imported')
const socks = (await db.items.toArray()).find(i => i.title === 'Socks')!
assert(socks.brandIds[0] === 'brand:muji' && (await db.places.get('q2'))?.brandId === 'brand:muji', 'old CSV: "Chain · Branch" becomes a chain link')

assert(parseCsv('a;b\r\n"x;y";2').at(-1)!.join('|') === 'x;y|2', 'semicolon CSV (spreadsheet re-save) parses')
threw = false
try { await importTripCsv('hello,world\n1,2') } catch { threw = true }
assert(threw, 'rejects a CSV that is not a trip export')
