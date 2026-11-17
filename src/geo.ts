import { createContext, useContext, useEffect, useState } from 'react'
import type { Item, LatLng, Place, Brand } from './types'

/* ---------- distance maths (no PostGIS needed at this scale) ---------- */
const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function fmtDist(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000)} km`
}

/** Straight-line estimate at ~80 m/min. Good enough to rank; Google Maps gives the real route. */
export function walkMins(m: number): string {
  const min = Math.max(1, Math.round((m * 1.25) / 80))
  return min > 90 ? 'far' : `~${min} min`
}

/* ---------- live position ---------- */
export type GeoStatus = 'waiting' | 'ok' | 'denied' | 'unavailable'
export interface GeoState { pos: LatLng | null; status: GeoStatus }
export const GeoContext = createContext<GeoState>({ pos: null, status: 'waiting' })
export const useGeo = () => useContext(GeoContext)

export function useWatchPosition(): GeoState {
  const [state, setState] = useState<GeoState>({ pos: null, status: 'waiting' })
  useEffect(() => {
    if (!('geolocation' in navigator)) { setState({ pos: null, status: 'unavailable' }); return }
    const id = navigator.geolocation.watchPosition(
      p => setState({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, status: 'ok' }),
      e => setState(s => ({ pos: s.pos, status: e.code === 1 ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  return state
}

/* ---------- which places can satisfy an item? ---------- */
export interface Index {
  placesById: Map<string, Place>
  placesByBrand: Map<string, Place[]>
  brandsById: Map<string, Brand>
}

export function buildIndex(places: Place[], brands: Brand[]): Index {
  const placesById = new Map(places.map(p => [p.id, p]))
  const placesByBrand = new Map<string, Place[]>()
  for (const p of places) {
    if (!p.brandId) continue
    const arr = placesByBrand.get(p.brandId) ?? []
    arr.push(p)
    placesByBrand.set(p.brandId, arr)
  }
  return { placesById, placesByBrand, brandsById: new Map(brands.map(b => [b.id, b])) }
}

export interface Candidate { place: Place; dist: number | null; via?: Brand }

/** Saved places + every known branch of the item's chains, nearest first. */
export function candidates(item: Item, idx: Index, pos: LatLng | null): Candidate[] {
  const seen = new Map<string, Candidate>()
  for (const id of item.placeIds) {
    const p = idx.placesById.get(id)
    if (p) seen.set(p.id, { place: p, dist: null })
  }
  for (const bid of item.brandIds) {
    const brand = idx.brandsById.get(bid)
    for (const p of idx.placesByBrand.get(bid) ?? []) {
      if (!seen.has(p.id)) seen.set(p.id, { place: p, dist: null, via: brand })
      else seen.get(p.id)!.via = brand
    }
  }
  const out = [...seen.values()]
  if (pos) for (const c of out) c.dist = haversine(pos, c.place)
  out.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0) || a.place.name.localeCompare(b.place.name))
  return out
}

export function storeLabel(item: Item, idx: Index): { name: string; extra?: string } {
  const brand = item.brandIds.map(id => idx.brandsById.get(id)).find(Boolean)
  if (brand) {
    const n = idx.placesByBrand.get(brand.id)?.length ?? 0
    return { name: brand.name, extra: n > 1 ? `any of ${n}` : undefined }
  }
  const first = idx.placesById.get(item.placeIds[0])
  if (!first) return { name: 'No store yet' }
  return { name: first.name, extra: item.placeIds.length > 1 ? `+${item.placeIds.length - 1} more` : undefined }
}

export function navUrl(p: Place, mode: 'walking' | 'transit' | 'driving'): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=${encodeURIComponent(p.id)}&travelmode=${mode}`
}
