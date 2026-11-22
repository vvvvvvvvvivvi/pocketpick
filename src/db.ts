import Dexie, { type Table } from 'dexie'
import type { Brand, Item, List, Place } from './types'
import { mapsPlaceUrl } from './geo.ts'

class PocketPinDB extends Dexie {
  lists!: Table<List, string>
  items!: Table<Item, string>
  places!: Table<Place, string>
  brands!: Table<Brand, string>

  constructor() {
    super('pocketpin')
    this.version(1).stores({
      lists: 'id,createdAt',
      items: 'id,listId,createdAt',
      places: 'id,brandId',
      brands: 'id'
    })
  }
}

export const db = new PocketPinDB()
export const uid = () => crypto.randomUUID()

export async function deleteList(id: string) {
  await db.transaction('rw', db.lists, db.items, async () => {
    await db.items.where('listId').equals(id).delete()
    await db.lists.delete(id)
  })
}

/** Local-first means the browser is the only copy. Export regularly. */
export async function exportAll(): Promise<string> {
  const [lists, items, places, brands] = await Promise.all([
    db.lists.toArray(), db.items.toArray(), db.places.toArray(), db.brands.toArray()
  ])
  return JSON.stringify({ app: 'pocketpin', version: 1, exportedAt: new Date().toISOString(), lists, items, places, brands }, null, 2)
}

export async function exportListCsv(listId: string): Promise<string> {
  const list = await db.lists.get(listId)
  if (!list) throw new Error('That trip no longer exists.')
  const [items, places, brands] = await Promise.all([
    db.items.where('listId').equals(listId).toArray(),
    db.places.toArray(),
    db.brands.toArray()
  ])
  const placesById = new Map(places.map(place => [place.id, place]))
  const placesByBrand = new Map<string, Place[]>()
  for (const place of places) {
    if (!place.brandId) continue
    const branches = placesByBrand.get(place.brandId) ?? []
    branches.push(place)
    placesByBrand.set(place.brandId, branches)
  }
  const brandNames = new Map(brands.map(brand => [brand.id, brand.name]))
  const cell = (value: string | number) => {
    const raw = String(value)
    const safe = typeof value === 'string' && /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  const rows = [[
    'Trip', 'Home', 'Home latitude', 'Home longitude', 'Item', 'Category',
    'Status', 'Store or branch', 'Address', 'Google Maps URL',
    'Chain', 'Latitude', 'Longitude'
  ]]

  for (const item of items) {
    const itemPlaces = new Map<string, { place: Place; brandName?: string }>()
    for (const placeId of item.placeIds) {
      const place = placesById.get(placeId)
      if (place) itemPlaces.set(place.id, { place })
    }
    for (const brandId of item.brandIds) {
      for (const place of placesByBrand.get(brandId) ?? []) {
        itemPlaces.set(place.id, { place, brandName: brandNames.get(brandId) })
      }
    }
    const assigned = [...itemPlaces.values()]
    const base = [
      list.name,
      list.homeName ?? '',
      list.home?.lat ?? '',
      list.home?.lng ?? '',
      item.title,
      item.tag,
      item.done ? 'Bought' : 'To buy'
    ]
    if (!assigned.length) {
      rows.push([...base, '', '', '', '', '', ''].map(cell))
      continue
    }
    for (const { place, brandName } of assigned) {
      rows.push([
        ...base,
        brandName ? `${brandName} · ${place.name}` : place.name,
        place.address ?? '',
        mapsPlaceUrl(place),
        brandName ?? '',
        place.lat,
        place.lng
      ].map(cell))
    }
  }
  return rows.map(row => row.join(',')).join('\r\n')
}

export async function importAll(text: string): Promise<{ lists: number; items: number }> {
  const data = JSON.parse(text)
  if (data?.app !== 'pocketpin' || !Array.isArray(data.lists) || !Array.isArray(data.items)) {
    throw new Error('This file is not a Pocket Pin export.')
  }
  await db.transaction('rw', db.lists, db.items, db.places, db.brands, async () => {
    await db.lists.bulkPut(data.lists)
    await db.items.bulkPut(data.items)
    await db.places.bulkPut(data.places ?? [])
    await db.brands.bulkPut(data.brands ?? [])
  })
  return { lists: data.lists.length, items: data.items.length }
}

/** Brand ids are derived from the chain name, so the same chain always maps to the same brand. */
export const brandIdFor = (name: string) => `brand:${name.trim().toLowerCase().replace(/\s+/g, '-')}`

/** Minimal RFC 4180 parser: quoted fields, "" escapes, newlines inside quotes, CRLF. Detects , ; or tab (spreadsheet re-saves). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

export interface CsvImportResult { lists: number; items: number; places: number; problems: string[] }

/**
 * Rebuilds trips from "Export trip CSV" files. Always creates new lists (never merges into existing ones).
 * Rows with Latitude/Longitude are restored with no Google calls; their fetchedAt is 0 so they are refreshed
 * the first time they are viewed (Google allows caching coordinates for 30 days only).
 * Older CSVs without coordinates need `resolve` (resolveMapsLink), costing one lookup per distinct place.
 */
export async function importTripCsv(text: string, resolve?: (url: string) => Promise<Place>): Promise<CsvImportResult> {
  const [header, ...rows] = parseCsv(text)
  const names = (header ?? []).map(h => h.trim().toLowerCase())
  const col = (name: string) => names.indexOf(name.toLowerCase())
  const iTrip = col('Trip'), iItem = col('Item')
  if (iTrip < 0 || iItem < 0) throw new Error('This CSV is not a Pocket Pin trip export.')
  const iHome = col('Home'), iHomeLat = col('Home latitude'), iHomeLng = col('Home longitude')
  const iCat = col('Category'), iStatus = col('Status'), iStore = col('Store or branch')
  const iAddr = col('Address'), iUrl = col('Google Maps URL'), iChain = col('Chain')
  const iLat = col('Latitude'), iLng = col('Longitude')
  // Undo the formula-injection guard the exporter adds ('=..., '+..., '-..., '@...).
  const get = (r: string[], i: number) => {
    const v = (i >= 0 ? r[i] ?? '' : '').trim()
    return /^'[=+\-@]/.test(v) ? v.slice(1) : v
  }
  const num = (v: string) => (v === '' ? NaN : Number(v))

  const now = Date.now()
  const problems: string[] = []
  const lists = new Map<string, List>()
  const items: Item[] = []
  const places = new Map<string, Place>()
  const brands = new Map<string, Brand>()
  const resolved = new Map<string, Place | null>()
  let prevKey = ''

  for (const [n, r] of rows.entries()) {
    const line = n + 2
    const tripName = get(r, iTrip) || 'Imported trip'
    const title = get(r, iItem)
    if (!title) { problems.push(`Row ${line}: no item name, skipped.`); continue }

    let list = lists.get(tripName)
    if (!list) {
      const lat = num(get(r, iHomeLat)), lng = num(get(r, iHomeLng))
      const homeName = get(r, iHome)
      list = { id: uid(), name: tripName, createdAt: now + lists.size,
        ...(Number.isFinite(lat) && Number.isFinite(lng) ? { home: { lat, lng } } : {}),
        ...(homeName ? { homeName } : {}) }
      lists.set(tripName, list)
    }

    // The exporter writes one row per assigned place, consecutively, so consecutive rows with the same item are one item.
    const tag: Item['tag'] = get(r, iCat).toLowerCase() === 'food' ? 'food' : 'things'
    const done = get(r, iStatus).toLowerCase() === 'bought'
    const key = [tripName, title, tag, done].join('\u0000')
    let item = items[items.length - 1]
    if (key !== prevKey || !item) {
      item = { id: uid(), listId: list.id, title, tag, done, placeIds: [], brandIds: [], createdAt: now + items.length }
      items.push(item)
      prevKey = key
    }

    const url = get(r, iUrl)
    if (!url) continue
    let store = get(r, iStore)
    let chain = get(r, iChain)
    if (iChain < 0 && store.includes(' · ')) chain = store.slice(0, store.indexOf(' · ')) // CSVs from before the Chain column
    if (chain && store.startsWith(`${chain} · `)) store = store.slice(chain.length + 3)
    const brandId = chain ? brandIdFor(chain) : undefined

    let place: Place | null = null
    let parsed: URL | null = null
    try { parsed = new URL(url) } catch { /* handled below */ }
    const placeId = parsed?.searchParams.get('query_place_id') ?? ''
    const pin = parsed?.searchParams.get('query')?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    let lat = num(get(r, iLat)), lng = num(get(r, iLng))
    if (!placeId && pin && !(Number.isFinite(lat) && Number.isFinite(lng))) { lat = Number(pin[1]); lng = Number(pin[2]) }
    const id = placeId || (pin ? `pin:${lat},${lng}` : '')

    if (id && Number.isFinite(lat) && Number.isFinite(lng)) {
      place = { id, name: store || (pin ? 'Pinned map location' : 'Unnamed place'), lat, lng, fetchedAt: 0,
        ...(get(r, iAddr) ? { address: get(r, iAddr) } : {}) }
    } else if (resolve) {
      if (!resolved.has(url)) {
        try { resolved.set(url, await resolve(url)) } catch (e) {
          resolved.set(url, null)
          problems.push(`Row ${line} (${store || url}): ${e instanceof Error ? e.message : 'could not find this place.'}`)
        }
      }
      place = resolved.get(url) ?? null
    } else {
      problems.push(`Row ${line} (${store || url}): no coordinates in this CSV, place skipped.`)
    }
    if (!place) continue

    if (brandId) {
      place = { ...place, brandId }
      if (!brands.has(brandId)) brands.set(brandId, { id: brandId, name: chain, fetchedAt: now })
      if (!item.brandIds.includes(brandId)) item.brandIds.push(brandId)
    } else if (!item.placeIds.includes(place.id)) {
      item.placeIds.push(place.id)
    }
    places.set(place.id, { ...places.get(place.id), ...place, brandId: place.brandId ?? places.get(place.id)?.brandId })
  }

  if (!lists.size) throw new Error('That CSV has no items to import.')
  await db.transaction('rw', [db.lists, db.items, db.places, db.brands], async () => {
    // Keep places/brands already on this device (they may be fresher); only fill in a missing chain link.
    const existing = await db.places.bulkGet([...places.keys()])
    await db.places.bulkPut([...places.values()].map((p, i) => {
      const old = existing[i]
      return old ? { ...old, brandId: old.brandId ?? p.brandId } : p
    }))
    const oldBrands = await db.brands.bulkGet([...brands.keys()])
    await db.brands.bulkPut([...brands.values()].filter((_, i) => !oldBrands[i]))
    await db.lists.bulkAdd([...lists.values()])
    await db.items.bulkAdd(items)
  })
  return { lists: lists.size, items: items.length, places: places.size, problems }
}
