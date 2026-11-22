import { buildRows, toCsv, toKml } from '../src/mymaps.ts'
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1) } else console.log('ok  ', m) }
const now = Date.now()
const muji = { id: 'brand:muji', name: 'Muji', fetchedAt: now }
const pa = { id: 'a', name: 'Muji "Flagship" <Ginza>', address: '1-1, Ginza', lat: 35.67, lng: 139.76, brandId: 'brand:muji', fetchedAt: now }
const pb = { id: 'b', name: '無印良品 渋谷', lat: 35.66, lng: 139.70, brandId: 'brand:muji', fetchedAt: now }
const pc = { id: 'pin:35.65,139.69', name: 'Dropped pin', lat: 35.65, lng: 139.69, fetchedAt: now }
const items = [
  { id: '1', listId: 'l', title: 'Gel pens', tag: 'things' as const, done: false, placeIds: [], brandIds: ['brand:muji'], createdAt: 1 },
  { id: '2', listId: 'l', title: 'Kit Kat & tea', tag: 'food' as const, done: false, placeIds: ['c'], brandIds: [], createdAt: 2 }
]
const resolve = (i: typeof items[number]) => i.id === '1' ? [{ place: pa, via: muji }, { place: pb, via: muji }] : [{ place: pc }]
const rows = buildRows('Tokyo trip', items, resolve)
assert(rows.length === 3, 'one row per item/place')
const csv = toCsv(rows)
assert(csv.startsWith('\uFEFF"Place"'), 'CSV has BOM + header')
assert(csv.includes('"Muji ""Flagship"" <Ginza>"'), 'CSV escapes quotes')
assert(csv.includes('無印良品 渋谷'), 'CSV keeps Japanese')
assert(csv.includes('"Dropped pin"'), 'pinned (non-Google-id) places export too')
const kml = toKml('Tokyo trip', rows)
assert(kml.includes('<name>Kit Kat &amp; tea</name>'), 'KML escapes &')
assert(kml.includes('<coordinates>139.76,35.67,0</coordinates>'), 'KML is lng,lat order')
assert((kml.match(/<Folder>/g) ?? []).length === 2, 'one folder per item')
import { writeFileSync } from 'node:fs'
writeFileSync('/tmp/sample.kml', kml)
