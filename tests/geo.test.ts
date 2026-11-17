import { haversine, candidates, buildIndex, storeLabel, fmtDist, walkMins, navUrl } from '../src/geo.ts'
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1) } else console.log('ok  ', m) }

const shibuya = { lat: 35.6595, lng: 139.7005 }
const tokyoStn = { lat: 35.6812, lng: 139.7671 }
const d = haversine(shibuya, tokyoStn)
assert(d > 6300 && d < 6900, `Shibuya→Tokyo Stn ≈ 6.5 km (got ${Math.round(d)} m)`)

const now = Date.now()
const places = [
  { id: 'dq1', name: 'Don Quijote Shibuya', lat: 35.6603, lng: 139.6990, brandId: 'brand:dq', fetchedAt: now },
  { id: 'dq2', name: 'Don Quijote Shinjuku', lat: 35.6938, lng: 139.7034, brandId: 'brand:dq', fetchedAt: now },
  { id: 'dq3', name: 'Don Quijote Roppongi', lat: 35.6628, lng: 139.7316, brandId: 'brand:dq', fetchedAt: now },
  { id: 'lw', name: 'Lawson Dogenzaka', lat: 35.6580, lng: 139.6985, fetchedAt: now },
  { id: 'nrt', name: 'Narita T1 Duty Free', lat: 35.7720, lng: 140.3929, fetchedAt: now }
]
const brands = [{ id: 'brand:dq', name: 'Don Quijote', fetchedAt: now }]
const idx = buildIndex(places, brands)
const item = { id: 'i', listId: 'l', title: 'Kit Kat', tag: 'food' as const, done: false, placeIds: ['lw', 'nrt', 'dq1'], brandIds: ['brand:dq'], createdAt: now }

const c = candidates(item, idx, shibuya)
assert(c.length === 5, `5 unique candidates, no duplicate for dq1 (got ${c.length})`)
assert(c[0].place.id === 'dq1' || c[0].place.id === 'lw', 'nearest is a Shibuya store')
assert(c.every((x, i) => i === 0 || x.dist! >= c[i - 1].dist!), 'sorted nearest first')
assert(c[c.length - 1].place.id === 'nrt', 'Narita is furthest')
assert(c.find(x => x.place.id === 'dq1')!.via?.name === 'Don Quijote', 'brand attached to branch')

const noPos = candidates(item, idx, null)
assert(noPos.every(x => x.dist === null), 'no position → no distances, no crash')

const lbl = storeLabel(item, idx)
assert(lbl.name === 'Don Quijote' && lbl.extra === 'any of 3', `store label "${lbl.name} · ${lbl.extra}"`)
assert(storeLabel({ ...item, brandIds: [] }, idx).extra === '+2 more', 'direct places label')
assert(storeLabel({ ...item, brandIds: [], placeIds: [] }, idx).name === 'No store yet', 'empty label')

assert(fmtDist(280) === '280 m' && fmtDist(1234) === '1.2 km' && fmtDist(58000) === '58 km', 'distance formatting')
assert(walkMins(280) === '~4 min', `walk estimate (${walkMins(280)})`)
assert(navUrl(places[0], 'walking').includes('destination=35.6603,139.699') && navUrl(places[0], 'walking').includes('destination_place_id=dq1'), 'Maps deep link')
