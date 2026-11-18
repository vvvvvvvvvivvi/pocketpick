import Dexie, { type Table } from 'dexie'
import type { Brand, Item, List, Place } from './types'
import { mapsPlaceUrl } from './geo'

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
    'Status', 'Store or branch', 'Address', 'Google Maps URL'
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
      rows.push([...base, '', '', ''].map(cell))
      continue
    }
    for (const { place, brandName } of assigned) {
      rows.push([
        ...base,
        brandName ? `${brandName} · ${place.name}` : place.name,
        place.address ?? '',
        mapsPlaceUrl(place)
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
