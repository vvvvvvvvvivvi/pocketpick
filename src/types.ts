export type Tag = 'food' | 'things'

export interface Stroke { c: string; p: [number, number][] }

/** A drawn icon. `vb` is the bounding box of the strokes (x, y, w, h) so it scales cleanly at any size. */
export interface Sketch { strokes: Stroke[]; vb: [number, number, number, number] }

export interface List { id: string; name: string; createdAt: number }

export interface Place {
  id: string            // Google place id (safe to store indefinitely)
  name: string
  address?: string
  lat: number
  lng: number
  brandId?: string
  fetchedAt: number     // coordinates are refreshed after 30 days (Google caching terms)
}

export interface Brand { id: string; name: string; fetchedAt: number }

export interface Item {
  id: string
  listId: string
  title: string
  tag: Tag
  sketch?: Sketch
  done: boolean
  placeIds: string[]    // specific saved places
  brandIds: string[]    // "any branch of this chain"
  createdAt: number
}

export interface LatLng { lat: number; lng: number }
