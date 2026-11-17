import Dexie, { type Table } from 'dexie'
import type { Brand, Item, List, Place } from './types'

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
